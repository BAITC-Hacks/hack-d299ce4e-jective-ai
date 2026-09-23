import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialState } from '../src/app/initial-state.js';
import { createStore } from '../src/app/store.js';
import { createHttpClient } from '../src/shared/api/client.js';
import { createProposalsRepository } from '../src/features/proposals/repository.js';
import { createProposalsController } from '../src/features/proposals/controller.js';
import { createProposalActions } from '../src/features/proposals/actions.js';

const userA = '11111111-1111-4111-8111-111111111111';
const userB = '22222222-2222-4222-8222-222222222222';
const proposalId = '33333333-3333-4333-8333-333333333333';
const values = () => ({
  teamName: 'Команда студентов',
  idea: 'Проанализируем динамику спроса',
  plan: 'Соберём данные\nПроверим гипотезы',
  deadline: 'Три недели',
  prototypeUrl: 'https://example.com/prototype',
});
const proposal = (overrides = {}) => ({
  id: proposalId,
  taskId: 47,
  taskTitle: 'Реальная задача бизнеса',
  ...values(),
  createdAt: '2026-09-23T10:30:00.000Z',
  status: 'pending',
  decidedAt: null,
  ...overrides,
});
const auth = (id = userA, role = 'student') => ({
  configured: true,
  status: 'authenticated',
  user: { id },
  profile: { id, role, full_name: 'Пользователь' },
  error: '',
  notice: '',
  busy: false,
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
function setup(t, { repository: override = {}, identity = auth() } = {}) {
  const initial = createInitialState();
  initial.auth = identity;
  initial.currentTaskId = 47;
  initial.catalog = {
    status: 'ready',
    error: '',
    items: [47, 91].map((id) => ({ id, title: `Задача ${id}`, status: 'published' })),
  };
  const store = createStore(initial);
  const calls = { submit: [], list: [], feedback: [], routes: [], form: [] };
  const persisted = [];
  const repository = {
    async list(owner) {
      calls.list.push(owner);
      return structuredClone(persisted);
    },
    async submit(payload, owner) {
      calls.submit.push({ payload, owner });
      const row = proposal(payload);
      persisted.push(row);
      return structuredClone(row);
    },
    ...override,
  };
  const router = {
    render() {},
    navigate(route) {
      calls.routes.push(route);
    },
  };
  const feedback = Object.fromEntries(
    ['modal', 'toast', 'success', 'closeModal'].map((method) => [
      method,
      (...args) => calls.feedback.push({ method, args }),
    ]),
  );
  const controller = createProposalsController({
    store,
    repository,
    router,
    feedback,
    renderForm(state) {
      calls.form.push(structuredClone(state.proposalForm));
    },
  });
  const actions = createProposalActions({
    store,
    repository,
    router,
    feedback,
    proposals: controller,
  });
  t.after(() => controller.dispose());
  return { store, calls, controller, actions, persisted };
}

test('proposal repository sends five real fields plus task ID with account-scoped bearer and unwraps DTOs', async () => {
  const expectedOwners = [];
  const requests = [];
  const client = createHttpClient({
    baseUrl: '/api',
    fetchImpl: async (url, options) => {
      requests.push({ url, ...options });
      return Response.json({ data: options.method === 'POST' ? proposal() : [proposal()] });
    },
  });
  const repository = createProposalsRepository({ apiBaseUrl: '/api' }, client, {
    async getAccessToken(owner) {
      expectedOwners.push(owner);
      return 'scoped.jwt.token';
    },
  });
  const list = await repository.list({ userId: userA });
  const saved = await repository.submit({ taskId: 47, ...values() }, { userId: userA });
  assert.deepEqual(list, [proposal()]);
  assert.deepEqual(saved, proposal());
  assert.deepEqual(expectedOwners, [userA, userA]);
  assert.equal(requests.length, 2);
  for (const request of requests) {
    assert.equal(request.url, '/api/proposals');
    assert.equal(request.headers.Authorization, 'Bearer scoped.jwt.token');
  }
  assert.equal(requests[0].method, 'GET');
  assert.equal(requests[1].method, 'POST');
  assert.deepEqual(JSON.parse(requests[1].body), { taskId: 47, ...values() });
  assert.equal(requests[1].body.includes(userA), false);
});

test('repository fails closed without a token, on mismatched sessions and malformed API responses', async () => {
  let calls = 0;
  const client = {
    async get() {
      calls++;
      return {};
    },
    async request() {
      calls++;
      return {};
    },
  };
  const anonymous = createProposalsRepository({}, client);
  await assert.rejects(anonymous.list({ userId: userA }), { code: 'UNAUTHORIZED' });
  await assert.rejects(anonymous.submit({ taskId: 47, ...values() }, { userId: userA }), {
    code: 'UNAUTHORIZED',
  });
  assert.equal(calls, 0);
  const changed = createProposalsRepository({}, client, {
    getAccessToken: async () => {
      throw new Error('Session changed');
    },
  });
  await assert.rejects(changed.list({ userId: userA }), /Session changed/);
  assert.equal(calls, 0);
  const invalid = createProposalsRepository({}, client, { getAccessToken: async () => 'token' });
  await assert.rejects(invalid.list({ userId: userA }), TypeError);
  await assert.rejects(invalid.submit({ taskId: 47, ...values() }, { userId: userA }), TypeError);
});

test('action opens the real named form and submission keeps the task selected at opening', async (t) => {
  const { actions, calls, controller, store } = setup(t);
  actions.offer();
  const modal = calls.feedback.find((call) => call.method === 'modal').args[0];
  assert.match(modal, /id="offer-form"/);
  for (const key of Object.keys(values())) assert.ok(modal.includes(`name="${key}"`));
  store.update((state) => ({ ...state, currentTaskId: 91 }));
  assert.equal(await actions['offer-success']({ ...values(), taskId: 91 }), true);
  await controller.load();
  assert.deepEqual(calls.submit[0], {
    payload: { taskId: 47, ...values() },
    owner: { userId: userA },
  });
  assert.equal(store.getState().proposals.items[0].taskId, 47);
  assert.equal(calls.feedback.filter((call) => call.method === 'success').length, 1);
});

test('POST completion is required for success and double clicks cannot submit twice', async (t) => {
  const response = deferred();
  let writes = 0;
  const { controller, store, calls } = setup(t, {
    repository: {
      async submit() {
        writes++;
        return response.promise;
      },
      async list() {
        return [proposal()];
      },
    },
  });
  assert.equal(controller.open(47), true);
  const first = controller.submit(values());
  assert.equal(store.getState().proposalForm.status, 'saving');
  assert.equal(await controller.submit(values()), false);
  assert.equal(writes, 1);
  assert.equal(
    calls.feedback.some((call) => call.method === 'success'),
    false,
  );
  assert.deepEqual(store.getState().proposals.items, []);
  store.update((state) => ({ ...state, currentTaskId: 91 }));
  response.resolve(proposal());
  assert.equal(await first, true);
  await controller.load();
  assert.equal(calls.feedback.filter((call) => call.method === 'success').length, 1);
  assert.equal(store.getState().proposals.items[0].taskId, 47);
});

test('network failure preserves every form field and retry succeeds without a false success', async (t) => {
  let attempts = 0;
  const { controller, calls, store } = setup(t, {
    repository: {
      async submit() {
        attempts++;
        if (attempts === 1) throw new Error('Нет соединения');
        return proposal();
      },
      async list() {
        return [proposal()];
      },
    },
  });
  controller.open(47);
  assert.equal(await controller.submit(values()), false);
  assert.equal(store.getState().proposalForm.status, 'error');
  assert.equal(store.getState().proposalForm.error, 'Нет соединения');
  assert.deepEqual(store.getState().proposalForm.values, values());
  assert.equal(store.getState().proposalForm.taskId, 47);
  assert.equal(
    calls.feedback.some((call) => call.method === 'success'),
    false,
  );
  assert.equal(await controller.submit(store.getState().proposalForm.values), true);
  await controller.load();
  assert.equal(attempts, 2);
  assert.equal(store.getState().proposalForm.taskId, null);
  assert.equal(store.getState().proposals.items.length, 1);
});

test('student and business reload their persisted lists with the verified owner scope', async (t) => {
  for (const role of ['student', 'business']) {
    const owners = [];
    const { controller, store } = setup(t, {
      identity: auth(userA, role),
      repository: {
        async list(owner) {
          owners.push(owner);
          return [proposal()];
        },
      },
    });
    await controller.load();
    assert.deepEqual(store.getState().proposals, {
      items: [proposal()],
      status: 'ready',
      error: '',
    });
    assert.deepEqual(owners, [{ userId: userA }]);
    await controller.load();
    assert.equal(owners.length, 1);
    await controller.load({ force: true });
    assert.equal(owners.length, 2);
  }
});

test('list failures are retriable and refresh actions request a fresh API list', async (t) => {
  let count = 0;
  const { controller, actions, store } = setup(t, {
    repository: {
      async list() {
        count++;
        if (count === 1) throw new Error('Offline');
        return [proposal()];
      },
    },
  });
  await controller.load();
  assert.equal(store.getState().proposals.status, 'error');
  assert.equal(store.getState().proposals.error, 'Offline');
  await actions['retry-proposals']();
  assert.equal(store.getState().proposals.status, 'ready');
  await actions['refresh-proposals']();
  assert.equal(count, 3);
});

test('late private list responses after account replacement or reset are ignored and private state is cleared', async (t) => {
  for (const reset of [false, true]) {
    const response = deferred();
    const { controller, store } = setup(t, { repository: { list: () => response.promise } });
    const loading = controller.load();
    await Promise.resolve();
    controller.open(47);
    store.update((state) => ({
      ...state,
      auth: auth(userB),
      proposalForm: { ...state.proposalForm, values: values() },
    }));
    if (reset) controller.reset();
    const before = structuredClone(store.getState());
    response.resolve([proposal()]);
    await loading;
    assert.deepEqual(store.getState(), before);
    assert.equal(store.getState().proposals.items.length, 0);
    if (reset) {
      assert.equal(store.getState().proposalForm.taskId, null);
      assert.equal(store.getState().proposalForm.values.idea, '');
    }
  }
});

test('late POST results after account replacement or reset never leak private data or show success', async (t) => {
  for (const reset of [false, true]) {
    const response = deferred();
    const { controller, store, calls } = setup(t, {
      repository: { submit: () => response.promise },
    });
    controller.open(47);
    const submission = controller.submit(values());
    store.update((state) => ({ ...state, auth: auth(userB) }));
    if (reset) controller.reset();
    const before = structuredClone(store.getState());
    response.resolve(proposal());
    assert.equal(await submission, false);
    assert.deepEqual(store.getState(), before);
    assert.equal(
      calls.feedback.some((call) => call.method === 'success'),
      false,
    );
  }
});

test('anonymous and business identities cannot open or submit; a role change after opening is rechecked', async (t) => {
  for (const identity of [
    auth(userA, 'business'),
    { ...auth(), status: 'anonymous', user: null, profile: null },
  ]) {
    const { controller, calls } = setup(t, { identity });
    assert.equal(controller.open(47), false);
    assert.equal(await controller.submit(values()), false);
    assert.equal(calls.submit.length, 0);
  }
  const { controller, store, calls } = setup(t);
  controller.open(47);
  store.update((state) => ({ ...state, auth: auth(userA, 'business') }));
  assert.equal(await controller.submit(values()), false);
  assert.equal(calls.submit.length, 0);
});

test('a list started before POST cannot overwrite the newly saved proposal', async (t) => {
  const oldList = deferred();
  const newList = deferred();
  let reads = 0;
  const { controller, store } = setup(t, {
    repository: {
      list() {
        reads++;
        return reads === 1 ? oldList.promise : newList.promise;
      },
      async submit() {
        return proposal();
      },
    },
  });
  const oldLoading = controller.load();
  await Promise.resolve();
  controller.open(47);
  assert.equal(await controller.submit(values()), true);
  const newLoading = controller.load();
  newList.resolve([proposal()]);
  await newLoading;
  assert.equal(store.getState().proposals.items.length, 1);
  oldList.resolve([]);
  await oldLoading;
  assert.deepEqual(store.getState().proposals.items, [proposal()]);
  assert.equal(store.getState().proposals.status, 'ready');
});

test('dispose prevents delayed requests from repopulating cleared private state', async (t) => {
  const response = deferred();
  const { controller, store, calls } = setup(t, { repository: { submit: () => response.promise } });
  controller.open(47);
  const pending = controller.submit(values());
  controller.dispose();
  response.resolve(proposal());
  assert.equal(await pending, false);
  assert.deepEqual(store.getState().proposals.items, []);
  assert.equal(store.getState().proposalForm.values.idea, '');
  assert.equal(
    calls.feedback.some((call) => call.method === 'success'),
    false,
  );
});

test('same-account token refresh does not lose a pending list or leave a successful form saving', async (t) => {
  const listResponse = deferred();
  const first = setup(t, { repository: { list: () => listResponse.promise } });
  const loading = first.controller.load();
  await Promise.resolve();
  first.store.update((state) => ({ ...state, auth: { ...state.auth, status: 'initializing' } }));
  listResponse.resolve([proposal()]);
  await loading;
  assert.equal(first.store.getState().proposals.status, 'ready');
  assert.deepEqual(first.store.getState().proposals.items, [proposal()]);

  const postResponse = deferred();
  const second = setup(t, {
    repository: {
      submit: () => postResponse.promise,
      async list() {
        return [proposal()];
      },
    },
  });
  second.controller.open(47);
  const pending = second.controller.submit(values());
  second.store.update((state) => ({ ...state, auth: { ...state.auth, status: 'initializing' } }));
  postResponse.resolve(proposal());
  assert.equal(await pending, true);
  await second.controller.load();
  assert.notEqual(second.store.getState().proposalForm.status, 'saving');
  assert.equal(second.store.getState().proposalForm.taskId, null);
  assert.deepEqual(second.store.getState().proposals.items, [proposal()]);
  assert.equal(second.calls.feedback.filter((call) => call.method === 'success').length, 1);
});
