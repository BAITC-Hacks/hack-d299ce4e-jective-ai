import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialState } from '../src/app/initial-state.js';
import { createStore } from '../src/app/store.js';
import { createProposalsController } from '../src/features/proposals/controller.js';
import { createProposalsRepository } from '../src/features/proposals/repository.js';
import { createProposalActions } from '../src/features/proposals/actions.js';

const userId = '11111111-1111-4111-8111-111111111111';
const otherId = '22222222-2222-4222-8222-222222222222';
const proposalId = '33333333-3333-4333-8333-333333333333';
const secondId = '44444444-4444-4444-8444-444444444444';
const decisionTime = '2026-09-23T15:00:00.000Z';
const proposal = (overrides = {}) => ({
  id: proposalId,
  taskId: 47,
  taskTitle: 'Задача бизнеса',
  teamName: 'Команда',
  idea: 'Идея решения',
  plan: 'План работы',
  deadline: 'Две недели',
  prototypeUrl: null,
  createdAt: '2026-09-23T10:00:00.000Z',
  status: 'pending',
  decidedAt: null,
  ...overrides,
});
const auth = (role = 'business', id = userId) => ({
  status: 'authenticated',
  user: { id },
  profile: { id, role, full_name: 'Пользователь' },
});
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  return { promise, resolve, reject };
}
function setup(t, overrides = {}) {
  const initial = createInitialState();
  initial.auth = auth();
  const rows = [proposal(), proposal({ id: secondId, taskId: 48 })];
  initial.proposals = { status: 'ready', items: structuredClone(rows), error: '' };
  const store = createStore(initial);
  const calls = { writes: [], reads: [], toasts: [], renders: 0 };
  const repository = {
    async decide(id, input, owner) {
      calls.writes.push({ id, input, owner });
      const row = rows.find((item) => item.id === id);
      Object.assign(row, { status: input.status, decidedAt: decisionTime });
      return structuredClone(row);
    },
    async list(owner) {
      calls.reads.push(owner);
      return structuredClone(rows);
    },
    ...overrides,
  };
  const feedback = { toast: (message) => calls.toasts.push(message) };
  const router = {
    render: () => {
      calls.renders++;
    },
  };
  const controller = createProposalsController({ store, repository, feedback, router });
  const actions = createProposalActions({ store, feedback, proposals: controller });
  t.after(() => controller.dispose());
  return { store, controller, actions, calls, rows };
}

test('business actions persist decisions for the clicked proposal and preserve all student fields', async (t) => {
  const { store, actions, calls, controller, rows } = setup(t);
  assert.equal(await actions['accept-proposal'](proposalId), true);
  assert.deepEqual(calls.writes[0], {
    id: proposalId,
    input: { status: 'accepted', expectedStatus: 'pending' },
    owner: { userId },
  });
  assert.deepEqual(
    store.getState().proposals.items[0],
    proposal({ status: 'accepted', decidedAt: decisionTime }),
  );
  assert.deepEqual(store.getState().proposals.items[1], proposal({ id: secondId, taskId: 48 }));
  assert.equal(await actions['reject-proposal'](proposalId), true);
  assert.deepEqual(calls.writes[1].input, { status: 'rejected', expectedStatus: 'accepted' });
  await controller.load({ force: true });
  assert.deepEqual(store.getState().proposals.items, rows);
  assert.deepEqual(calls.toasts, ['Отклик принят', 'Отклик отклонён']);
});

test('no optimistic success; double clicks and refresh cannot overwrite an in-flight decision', async (t) => {
  const response = deferred();
  let writes = 0;
  const { store, controller, calls } = setup(t, {
    decide: () => {
      writes++;
      return response.promise;
    },
  });
  const saving = controller.decide(proposalId, 'accepted');
  assert.equal(store.getState().proposalDecision.status, 'saving');
  assert.equal(store.getState().proposals.items[0].status, 'pending');
  assert.equal(await controller.decide(secondId, 'rejected'), false);
  await controller.load({ force: true });
  assert.equal(calls.reads.length, 0);
  assert.equal(writes, 1);
  assert.equal(calls.toasts.length, 0);
  response.resolve(proposal({ status: 'accepted', decidedAt: decisionTime }));
  assert.equal(await saving, true);
  assert.equal(store.getState().proposalDecision.status, 'idle');
});

test('failed decision keeps the old status and fields, shows a scoped error and can be retried', async (t) => {
  let attempts = 0;
  const { store, controller, calls } = setup(t, {
    async decide() {
      if (++attempts === 1) throw new Error('Нет соединения');
      return proposal({ status: 'accepted', decidedAt: decisionTime });
    },
  });
  assert.equal(await controller.decide(proposalId, 'accepted'), false);
  assert.deepEqual(store.getState().proposals.items[0], proposal());
  assert.deepEqual(store.getState().proposalDecision, {
    id: proposalId,
    status: 'error',
    error: 'Нет соединения',
  });
  assert.equal(calls.toasts.length, 0);
  assert.equal(await controller.decide(proposalId, 'accepted'), true);
  assert.equal(attempts, 2);
});

test('stale expected status conflict reloads the actual decision without overwriting it', async (t) => {
  const serverRow = proposal({ status: 'accepted', decidedAt: decisionTime });
  const { store, controller, calls } = setup(t, {
    async decide() {
      throw Object.assign(new Error('Решение уже изменилось. Обновите отклик.'), {
        code: 'PROPOSAL_DECISION_CONFLICT',
      });
    },
    async list() {
      return [serverRow];
    },
  });
  assert.equal(await controller.decide(proposalId, 'rejected'), false);
  assert.deepEqual(store.getState().proposals.items, [serverRow]);
  assert.equal(store.getState().proposalDecision.status, 'idle');
  assert.match(calls.toasts.at(-1), /Решение уже изменилось/);
});

test('refresh reconciles a timed-out committed decision and clears the obsolete error', async (t) => {
  const serverRow = proposal({ status: 'accepted', decidedAt: decisionTime });
  const { store, controller } = setup(t, {
    async decide() {
      throw new Error('Время ожидания истекло');
    },
    async list() {
      return [serverRow];
    },
  });
  assert.equal(await controller.decide(proposalId, 'accepted'), false);
  assert.equal(store.getState().proposalDecision.status, 'error');
  await controller.load({ force: true });
  assert.deepEqual(store.getState().proposals.items, [serverRow]);
  assert.deepEqual(store.getState().proposalDecision, { id: null, status: 'idle', error: '' });
});

test('student, guest, unverified or mismatched profile cannot send a decision', async (t) => {
  const { store, controller, calls } = setup(t);
  for (const identity of [
    auth('student'),
    { status: 'anonymous' },
    { ...auth(), status: 'initializing' },
    { ...auth(), profile: { ...auth().profile, id: otherId } },
  ]) {
    store.update((state) => ({ ...state, auth: identity }));
    assert.equal(await controller.decide(proposalId, 'accepted'), false);
  }
  assert.equal(calls.writes.length, 0);
});

test('invalid, missing, already decided or unloaded targets do not issue writes', async (t) => {
  const { store, controller, calls } = setup(t);
  assert.equal(await controller.decide('unknown', 'accepted'), false);
  assert.equal(await controller.decide(proposalId, 'pending'), false);
  await controller.decide(proposalId, 'accepted');
  assert.equal(await controller.decide(proposalId, 'accepted'), true);
  assert.equal(calls.writes.length, 1);
  store.update((state) => ({ ...state, proposals: { ...state.proposals, status: 'loading' } }));
  assert.equal(await controller.decide(proposalId, 'rejected'), false);
  assert.equal(calls.writes.length, 1);
});

test('account change, reset and disposal ignore a late decision response', async (t) => {
  for (const invalidate of ['account', 'reset', 'dispose']) {
    const response = deferred();
    const { store, controller, calls } = setup(t, { decide: () => response.promise });
    const saving = controller.decide(proposalId, 'accepted');
    if (invalidate === 'account')
      store.update((state) => ({ ...state, auth: auth('business', otherId) }));
    else controller[invalidate]();
    const before = structuredClone(store.getState());
    response.resolve(proposal({ status: 'accepted', decidedAt: decisionTime }));
    assert.equal(await saving, false);
    assert.deepEqual(store.getState(), before);
    assert.equal(calls.toasts.length, 0);
  }
});

test('same-account token refresh preserves a pending decision response', async (t) => {
  const response = deferred();
  const { store, controller } = setup(t, { decide: () => response.promise });
  const saving = controller.decide(proposalId, 'accepted');
  store.update((state) => ({ ...state, auth: { ...state.auth, status: 'initializing' } }));
  response.resolve(proposal({ status: 'accepted', decidedAt: decisionTime }));
  assert.equal(await saving, true);
  assert.equal(store.getState().proposals.items[0].status, 'accepted');
  assert.equal(store.getState().proposalDecision.status, 'idle');
});

test('repository sends only decision and expected status with a scoped bearer, validates response', async () => {
  const calls = [];
  const owners = [];
  let returned = proposal({ status: 'accepted', decidedAt: decisionTime });
  const repository = createProposalsRepository(
    {},
    {
      async request(path, options) {
        calls.push({ path, options });
        return returned;
      },
    },
    {
      getAccessToken: async (owner) => {
        owners.push(owner);
        return 'scoped.jwt.token';
      },
    },
  );
  const payload = { status: 'accepted', expectedStatus: 'pending' };
  assert.deepEqual(await repository.decide(proposalId, payload, { userId }), returned);
  assert.deepEqual(owners, [userId]);
  assert.equal(calls[0].path, `/proposals/${proposalId}/decision`);
  assert.equal(calls[0].options.method, 'PATCH');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer scoped.jwt.token');
  assert.deepEqual(JSON.parse(calls[0].options.body), payload);
  await assert.rejects(
    repository.decide(proposalId, { ...payload, studentId: otherId }, { userId }),
    TypeError,
  );
  await assert.rejects(repository.decide('../other', payload, { userId }), TypeError);
  returned = proposal({ id: secondId, status: 'accepted', decidedAt: decisionTime });
  await assert.rejects(repository.decide(proposalId, payload, { userId }), {
    code: 'INVALID_RESPONSE',
  });
  returned = proposal();
  await assert.rejects(repository.decide(proposalId, payload, { userId }), {
    code: 'INVALID_RESPONSE',
  });
});

test('decision repository refuses missing or switched sessions before HTTP', async () => {
  let requests = 0;
  const client = {
    request() {
      requests++;
    },
  };
  const payload = { status: 'accepted', expectedStatus: 'pending' };
  const missing = createProposalsRepository({}, client);
  await assert.rejects(missing.decide(proposalId, payload, { userId }), { code: 'UNAUTHORIZED' });
  const changed = createProposalsRepository({}, client, {
    getAccessToken: async () => {
      throw new Error('Сессия изменилась');
    },
  });
  await assert.rejects(changed.decide(proposalId, payload, { userId }), /Сессия изменилась/);
  assert.equal(requests, 0);
});
