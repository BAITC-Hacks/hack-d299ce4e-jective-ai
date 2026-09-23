import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialState } from '../src/app/initial-state.js';
import { createStore } from '../src/app/store.js';
import { createProposalActions } from '../src/features/proposals/actions.js';
import { detail } from '../src/pages/catalog.js';

const userId = '11111111-1111-4111-8111-111111111111';
const otherId = '22222222-2222-4222-8222-222222222222';

function studentAuth(overrides = {}) {
  const profile = Object.hasOwn(overrides, 'profile')
    ? overrides.profile
    : { id: userId, role: 'student' };
  return {
    ...createInitialState().auth,
    configured: true,
    status: 'authenticated',
    user: { id: userId },
    ...overrides,
    profile: profile ? { full_name: 'Тестовый пользователь', ...profile } : null,
  };
}

function taskState(auth = studentAuth()) {
  const state = createInitialState();
  state.auth = auth;
  state.currentTaskId = 47;
  state.catalog = {
    status: 'ready',
    error: '',
    items: [
      {
        id: 47,
        title: 'Открытая задача бизнеса',
        description: 'Публичное описание задачи',
        industry: '',
        direction: '',
        score: null,
        tags: [],
        card: {},
        status: 'published',
      },
    ],
  };
  return state;
}

const forbiddenIdentities = [
  ['business', studentAuth({ profile: { id: userId, role: 'business' } })],
  ['anonymous', studentAuth({ status: 'anonymous', user: null, profile: null })],
  ['initializing with a retained student profile', studentAuth({ status: 'initializing' })],
  ['failed authentication with a retained student profile', studentAuth({ status: 'error' })],
  ['missing profile', studentAuth({ profile: null })],
  ['missing user', studentAuth({ user: null })],
  ['missing user id', studentAuth({ user: {} })],
  ['missing profile id', studentAuth({ profile: { role: 'student' } })],
  ['empty matching ids', studentAuth({ user: { id: '' }, profile: { id: '', role: 'student' } })],
  ['mismatched identities', studentAuth({ profile: { id: otherId, role: 'student' } })],
  ['unknown role', studentAuth({ profile: { id: userId, role: 'admin' } })],
];

test('task detail offers proposing and saving only to an authenticated student', () => {
  const state = taskState();
  // The form selection must not override the authenticated account role.
  state.role = 'business';
  const html = detail(state);
  assert.match(html, /Хотите решить эту задачу\?/);
  assert.match(html, /Расскажите бизнесу, как ваша команда предлагает подойти к решению\./);
  assert.match(html, /data-action="offer"/);
  assert.match(html, /data-action="save-task"/);
  assert.doesNotMatch(html, /detail-grid--single/);
});

for (const [label, auth] of forbiddenIdentities) {
  test(`task detail hides student CTA for ${label} without hiding the public task`, () => {
    const state = taskState(auth);
    state.role = 'student';
    const html = detail(state);
    assert.doesNotMatch(html, /Хотите решить эту задачу\?|Расскажите бизнесу, как ваша команда/);
    assert.doesNotMatch(html, /data-action="(?:offer|save-task)"/);
    assert.match(html, /detail-grid--single/);
    assert.match(html, /Открытая задача бизнеса/);
    assert.match(html, /Публичное описание задачи/);
  });
}

function proposalHarness(auth = studentAuth()) {
  const initial = taskState(auth);
  initial.role = 'student';
  const store = createStore(initial);
  const calls = [];
  const feedback = Object.fromEntries(
    ['modal', 'toast', 'closeModal', 'success'].map((name) => [
      name,
      (...args) => calls.push({ name, args }),
    ]),
  );
  const router = {
    render: (...args) => calls.push({ name: 'render', args }),
    navigate: (...args) => calls.push({ name: 'navigate', args }),
  };
  const proposals = {
    open(taskId) {
      store.update((state) => ({ ...state, proposalForm: { ...state.proposalForm, taskId } }));
      return true;
    },
    submit(values) {
      calls.push({ name: 'submit', args: [values] });
    },
    load() {},
  };
  const actions = createProposalActions({ store, router, feedback, proposals });
  return { store, calls, actions };
}

for (const [label, auth] of forbiddenIdentities) {
  for (const action of ['offer', 'offer-success']) {
    test(`${action} refuses ${label} even if invoked directly`, () => {
      const { store, calls, actions } = proposalHarness(auth);
      const before = structuredClone(store.getState());
      actions[action]();
      assert.deepEqual(store.getState(), before);
      assert.equal(calls.length, 1);
      assert.equal(calls[0].name, 'toast');
      assert.ok(calls[0].args[0]);
    });
  }
}

test('authenticated student can open a blank form and delegate all fields to persistent submission', () => {
  const { store, calls, actions } = proposalHarness();
  store.update((state) => ({ ...state, role: 'business' }));
  actions.offer();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, 'modal');
  assert.match(calls[0].args[0], /id="offer-form"/);
  assert.doesNotMatch(calls[0].args[0], /Data Wizards|деморежим/);
  assert.equal(store.getState().proposalForm.taskId, 47);
  const values = {
    teamName: 'Команда',
    idea: 'Идея',
    plan: 'План',
    deadline: '2 недели',
    prototypeUrl: '',
  };
  actions['offer-success'](values);
  assert.equal(calls[1].name, 'submit');
  assert.deepEqual(calls[1].args[0], values);
  assert.equal(
    calls.some(({ name }) => name === 'toast'),
    false,
  );
});

test('submission rechecks the role when account changes to business after opening the modal', () => {
  const { store, calls, actions } = proposalHarness();
  actions.offer();
  assert.equal(calls[0].name, 'modal');
  store.update((state) => ({
    ...state,
    auth: studentAuth({ profile: { id: userId, role: 'business' } }),
  }));
  const before = structuredClone(store.getState());
  calls.length = 0;
  actions['offer-success']();
  assert.deepEqual(store.getState(), before);
  assert.deepEqual(
    calls.map(({ name }) => name),
    ['toast'],
  );
});
