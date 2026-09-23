import assert from 'node:assert/strict';
import test from 'node:test';
import { bindEvents } from '../src/app/events.js';
import { createInitialState } from '../src/app/initial-state.js';
import { createStore } from '../src/app/store.js';

const proposalId = '11111111-1111-4111-8111-111111111111';
const otherProposalId = '22222222-2222-4222-8222-222222222222';
const userId = '33333333-3333-4333-8333-333333333333';

function eventSurface() {
  const listeners = new Map();
  return {
    addEventListener(type, handler, { signal } = {}) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(handler);
      signal?.addEventListener('abort', () => listeners.get(type).delete(handler), { once: true });
    },
    emit(type, event) {
      for (const handler of listeners.get(type) || []) handler(event);
    },
  };
}

function setup(t) {
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const documentRef = eventSurface();
  const windowRef = eventSurface();
  Object.defineProperty(globalThis, 'document', { configurable: true, value: documentRef });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: windowRef });

  const state = createInitialState();
  state.auth = {
    ...state.auth,
    status: 'authenticated',
    user: { id: userId },
    profile: { id: userId, role: 'business', full_name: 'Пользователь' },
  };
  state.currentTaskId = 987;
  const store = createStore(state);
  const decisions = [];
  const routes = [];
  const pending = [];
  const unbind = bindEvents({
    store,
    router: { navigate: (route) => routes.push(route), render() {} },
    feedback: { modal() {}, toast() {}, closeModal() {}, success() {} },
    proposals: {
      decide(id, status) {
        decisions.push({ id, status });
        const completion = Promise.resolve(true);
        pending.push(completion);
        return completion;
      },
      open() {},
      submit() {},
      load() {},
    },
    publication: { edit() {}, save() {}, loadMine() {} },
    workspace: { hasUnsaved: () => false, flush: async () => true, retry() {}, newDraft() {} },
    catalog: { load() {} },
    authController: { logout() {}, retry() {} },
    service: {},
  });
  t.after(() => {
    unbind();
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
    else delete globalThis.document;
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else delete globalThis.window;
  });
  return { store, documentRef, decisions, routes, pending, unbind };
}

test('real delegated accept/reject clicks resolve nested targets and dispatch the proposal UUID, not task IDs', async (t) => {
  const { documentRef, store, decisions, routes, pending } = setup(t);
  const before = structuredClone(store.getState());
  const selectors = [];
  for (const [action, id] of [
    ['accept-proposal', proposalId],
    ['reject-proposal', otherProposalId],
  ]) {
    const button = { dataset: { action, proposalId: id, taskId: '123' } };
    const nestedIcon = {
      closest(selector) {
        selectors.push(selector);
        return button;
      },
    };
    documentRef.emit('click', { target: nestedIcon });
  }
  await Promise.all(pending);
  assert.deepEqual(decisions, [
    { id: proposalId, status: 'accepted' },
    { id: otherProposalId, status: 'rejected' },
  ]);
  assert.equal(selectors.length, 2);
  for (const selector of selectors) assert.ok(selector.includes('[data-action]'));
  assert.deepEqual(routes, []);
  assert.deepEqual(store.getState(), before);
});

test('anonymous decision clicks are redirected to login before calling any mutation', async (t) => {
  const { documentRef, store, decisions, routes, pending } = setup(t);
  store.update((state) => ({
    ...state,
    auth: { ...state.auth, status: 'anonymous', user: null, profile: null },
  }));
  const before = structuredClone(store.getState());
  for (const action of ['accept-proposal', 'reject-proposal']) {
    const button = {
      dataset: { action, proposalId, taskId: '47' },
      closest() {
        return this;
      },
    };
    documentRef.emit('click', { target: button });
  }
  await Promise.all(pending);
  assert.deepEqual(decisions, []);
  assert.deepEqual(routes, ['login', 'login']);
  assert.deepEqual(store.getState(), before);
});

test('unrelated clicks and disposed event listeners cannot dispatch proposal decisions', async (t) => {
  const { documentRef, decisions, routes, pending, unbind } = setup(t);
  documentRef.emit('click', { target: { closest: () => null } });
  unbind();
  documentRef.emit('click', {
    target: { closest: () => ({ dataset: { action: 'accept-proposal', proposalId } }) },
  });
  await Promise.all(pending);
  assert.deepEqual(decisions, []);
  assert.deepEqual(routes, []);
});
