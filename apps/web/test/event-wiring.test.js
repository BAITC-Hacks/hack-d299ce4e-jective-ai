import assert from 'node:assert/strict';
import test from 'node:test';
import { bindEvents } from '../src/app/events.js';
import { createInitialState } from '../src/app/initial-state.js';
import { createStore } from '../src/app/store.js';

function surface() {
  const listeners = new Map();
  return {
    visibilityState: 'visible',
    addEventListener(name, listener, { signal } = {}) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(listener);
      signal?.addEventListener('abort', () => listeners.get(name).delete(listener), { once: true });
    },
    emit(name, event = {}) {
      for (const listener of listeners.get(name) || []) listener(event);
    },
  };
}

function fixture(t) {
  const previous = ['document', 'window'].map((key) => [
    key,
    Object.getOwnPropertyDescriptor(globalThis, key),
  ]);
  const documentRef = surface();
  const windowRef = surface();
  Object.defineProperty(globalThis, 'document', { configurable: true, value: documentRef });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: windowRef });
  const state = createInitialState();
  const id = '550e8400-e29b-41d4-a716-446655440000';
  state.auth = {
    ...state.auth,
    status: 'authenticated',
    user: { id },
    profile: { id, role: 'business', full_name: 'Business' },
  };
  state.currentTaskId = 999;
  const store = createStore(state);
  const calls = [];
  const pending = [];
  let dirty = false;
  const operation = (name, value) => {
    calls.push([name, value]);
    const request = Promise.resolve(true);
    pending.push(request);
    return request;
  };
  const unbind = bindEvents({
    store,
    router: { navigate: (route) => calls.push(['navigate', route]), render() {} },
    feedback: { modal() {}, toast() {}, closeModal() {}, success() {} },
    publication: {
      edit: (id) => operation('edit', id),
      save: (status) => operation('save', status),
      loadMine() {},
    },
    workspace: {
      hasUnsaved: () => dirty,
      flush: () => operation('flush'),
      newDraft: () => true,
      retry() {},
    },
    proposals: {
      publish() {
        assert.fail('Publishing belongs to the task controller, not proposals');
      },
      open() {},
      submit() {},
      load() {},
      decide() {},
    },
    catalog: { load() {} },
    authController: { logout() {}, retry() {} },
    service: {},
  });
  t.after(() => {
    unbind();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  function click(action, extras = {}) {
    const button = { dataset: { action, taskId: '42' }, ...extras };
    documentRef.emit('click', {
      target: {
        closest(selector) {
          assert.match(selector, /\[data-action\]/);
          return button;
        },
      },
    });
  }
  return {
    store,
    calls,
    pending,
    click,
    documentRef,
    windowRef,
    unbind,
    dirty: (value) => {
      dirty = value;
    },
  };
}

test('delegated task edit and confirmed publication call the persistence controller with the clicked task ID', async (t) => {
  const { click, calls, pending } = fixture(t);
  click('edit-task');
  click('confirm-publish');
  click('save-draft');
  await Promise.all(pending);
  assert.deepEqual(calls, [
    ['edit', '42'],
    ['save', 'published'],
    ['save', 'draft'],
  ]);
});

test('anonymous and initializing task mutations navigate to login without invoking persistence', async (t) => {
  const { store, click, calls, pending } = fixture(t);
  for (const status of ['anonymous', 'initializing']) {
    store.update((state) => ({ ...state, auth: { ...state.auth, status } }));
    click('edit-task');
    click('confirm-publish');
    click('save-draft');
  }
  await Promise.all(pending);
  assert.deepEqual(
    calls,
    Array.from({ length: 6 }, () => ['navigate', 'login']),
  );
});

test('disabled task controls do not dispatch and listener disposal prevents subsequent mutations', async (t) => {
  const { click, calls, pending, unbind } = fixture(t);
  click('confirm-publish', { disabled: true });
  click('edit-task', { getAttribute: () => 'true' });
  unbind();
  click('confirm-publish');
  await Promise.all(pending);
  assert.deepEqual(calls, []);
});

test('dirty workspaces warn before unload and hidden documents flush, with cleanup on dispose', async (t) => {
  const { dirty, windowRef, documentRef, calls, pending, unbind } = fixture(t);
  let prevented = 0;
  const cleanUnload = {
    preventDefault() {
      prevented++;
    },
  };
  windowRef.emit('beforeunload', cleanUnload);
  assert.equal(prevented, 0);
  assert.equal(cleanUnload.returnValue, undefined);
  dirty(true);
  const dirtyUnload = {
    preventDefault() {
      prevented++;
    },
  };
  windowRef.emit('beforeunload', dirtyUnload);
  assert.equal(prevented, 1);
  assert.equal(dirtyUnload.returnValue, '');
  documentRef.emit('visibilitychange');
  assert.deepEqual(calls, []);
  documentRef.visibilityState = 'hidden';
  documentRef.emit('visibilitychange');
  await Promise.all(pending);
  assert.deepEqual(calls, [['flush', undefined]]);
  unbind();
  windowRef.emit('beforeunload', dirtyUnload);
  documentRef.emit('visibilitychange');
  await Promise.all(pending);
  assert.equal(prevented, 1);
  assert.equal(calls.length, 1);
});
