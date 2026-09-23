import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialState } from '../src/app/initial-state.js';
import { createStore } from '../src/app/store.js';
import { fieldLabels } from '../src/services/ai/types.js';
import { createPublicationController } from '../src/features/tasks/publication-controller.js';

const owner = 'c5928c6a-3e8a-41d5-aec4-baf6c07c5b2a';
const requestId = '8609c107-b9be-4502-930d-94da84feb608';
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, resolve, reject };
};
const settle = async () => {
  for (let index = 0; index < 10; index += 1) await Promise.resolve();
};

function setup(t, overrides = {}) {
  const initial = createInitialState();
  initial.auth = {
    ...initial.auth,
    status: 'authenticated',
    user: { id: owner },
    profile: { id: owner, role: 'business' },
  };
  initial.workspace = { status: 'ready', error: '', loaded: true };
  initial.description = 'Наше приватное исходное описание задачи для образовательного центра.';
  initial.fields = Object.fromEntries(
    Object.values(fieldLabels).map((label) => [label, `${label}: настоящий текст`]),
  );
  initial.taskMetadata = { industry: 'Образование', direction: '', tags: [] };
  initial.ownTasks = { items: [], status: 'ready', error: '' };
  const store = createStore(initial);
  const writes = [];
  const notices = [];
  const routes = [];
  const catalogLoads = [];
  let task;
  let generation = 0;
  const workspace = {
    scope: () => `owner:${generation}`,
    isCurrent: (scope) =>
      scope === `owner:${generation}` && store.getState().auth.user?.id === owner,
    flush: async () => true,
    newDraft: () => {
      generation += 1;
      return true;
    },
    ...overrides.workspace,
  };
  const repository = {
    save: async (payload, options) => {
      writes.push({ payload: structuredClone(payload), options });
      task = {
        ...structuredClone(payload),
        title: payload.card.title,
        id: 731,
        originalDescription: payload.description,
        reply: 0,
      };
      return task;
    },
    mine: async () => (task ? [task] : []),
    ...overrides.repository,
  };
  const controller = createPublicationController({
    store,
    repository,
    workspace,
    catalog: {
      load: async (options) => {
        catalogLoads.push(options);
      },
    },
    router: { render() {}, navigate: (route) => routes.push(route) },
    feedback: {
      closeModal() {},
      toast: (message) => notices.push(message),
      success: (...args) => notices.push(args),
    },
    createId: () => requestId,
  });
  t.after(() => controller.dispose());
  return { store, controller, writes, notices, routes, catalogLoads, workspace };
}

test('draft and publication persist once each with the same request ID and returned database ID', async (t) => {
  const { store, controller, writes, catalogLoads, notices } = setup(t);
  assert.equal(await controller.save('draft'), true);
  assert.equal(store.getState().taskSave.task.id, 731);
  assert.equal(store.getState().taskSave.task.status, 'draft');
  assert.equal(writes[0].payload.requestId, requestId);
  assert.equal(writes[0].options.userId, owner);
  assert.deepEqual(catalogLoads, []);
  assert.equal(await controller.save('published'), true);
  assert.equal(writes.length, 2);
  assert.equal(writes[1].payload.requestId, requestId);
  assert.equal(writes[1].payload.status, 'published');
  assert.equal(store.getState().taskSave.task.id, 731);
  assert.equal(store.getState().ownTasks.items.length, 1);
  assert.deepEqual(catalogLoads, [{ force: true }]);
  assert.equal(notices.at(-1).at(-1), 'detail?id=731');
});

test('concurrent publication clicks do not produce duplicate requests or rotate idempotency keys', async (t) => {
  const response = deferred();
  const writes = [];
  const { controller, store } = setup(t, {
    repository: {
      save: async (payload) => {
        writes.push(payload);
        await response.promise;
        return { ...payload, id: 731 };
      },
    },
  });
  const publishing = controller.save('published');
  await settle();
  assert.equal(store.getState().taskSave.status, 'saving');
  assert.equal(await controller.save('published'), false);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].requestId, requestId);
  response.resolve();
  assert.equal(await publishing, true);
});

test('failed publication keeps user fields and retries with the same request ID', async (t) => {
  let fail = true;
  const requests = [];
  const { controller, store, notices } = setup(t, {
    repository: {
      save: async (payload) => {
        requests.push(payload);
        if (fail) throw new Error('Write failed');
        return { ...payload, id: 731 };
      },
    },
  });
  const originalFields = structuredClone(store.getState().fields);
  assert.equal(await controller.save('published'), false);
  assert.equal(store.getState().taskSave.status, 'error');
  assert.equal(store.getState().taskSave.error, 'Write failed');
  assert.deepEqual(store.getState().fields, originalFields);
  assert.equal(store.getState().taskSave.requestId, requestId);
  assert.deepEqual(notices, []);
  fail = false;
  assert.equal(await controller.save('published'), true);
  assert.equal(requests[1].requestId, requests[0].requestId);
});

test('private owner DTO is never copied to the public catalog during publication', async (t) => {
  const { controller, store, writes } = setup(t);
  store.update((state) => ({
    ...state,
    catalog: { items: [{ id: 21, title: 'Existing public task' }], status: 'ready', error: '' },
  }));
  const before = structuredClone(store.getState().catalog);
  assert.equal(await controller.save('published'), true);
  assert.equal(writes[0].payload.card.businessContact, 'Контакт бизнеса: настоящий текст');
  assert.deepEqual(store.getState().catalog, before);
  assert.doesNotMatch(JSON.stringify(store.getState().catalog), /Контакт бизнеса|приватное/);
});

test('published task edits remain published even when using the save-draft action', async (t) => {
  const { controller, store, writes } = setup(t);
  await controller.save('published');
  store.update((state) => ({
    ...state,
    fields: { ...state.fields, Название: 'Обновлённый заголовок' },
  }));
  await controller.save('draft');
  assert.equal(writes[1].payload.status, 'published');
  assert.equal(writes[1].payload.card.title, 'Обновлённый заголовок');
  assert.equal(store.getState().taskSave.task.id, 731);
});

test('publishing requires authenticated business, restored workspace and valid fields', async (t) => {
  const { controller, store, writes, routes } = setup(t);
  store.update((state) => ({ ...state, auth: { ...state.auth, status: 'anonymous' } }));
  assert.equal(await controller.save('published'), false);
  assert.deepEqual(routes, ['login']);
  store.update((state) => ({
    ...state,
    auth: {
      ...state.auth,
      status: 'authenticated',
      profile: { ...state.auth.profile, role: 'student' },
    },
  }));
  assert.equal(await controller.save('published'), false);
  store.update((state) => ({
    ...state,
    auth: { ...state.auth, profile: { ...state.auth.profile, role: 'business' } },
    workspace: { status: 'error', loaded: false },
  }));
  assert.equal(await controller.save('published'), false);
  store.update((state) => ({
    ...state,
    workspace: { status: 'ready', loaded: true },
    fields: { ...state.fields, Название: '' },
  }));
  assert.equal(await controller.save('published'), false);
  assert.deepEqual(writes, []);
  assert.equal(store.getState().taskSave.status, 'error');
});

test('failed workspace persistence prevents publishing a task without the questionnaire answers', async (t) => {
  const { controller, store, writes } = setup(t, { workspace: { flush: async () => false } });
  assert.equal(await controller.save('published'), false);
  assert.deepEqual(writes, []);
  assert.equal(store.getState().taskSave.status, 'error');
  assert.match(store.getState().taskSave.error, /ответы в Supabase/);
});

test('late publication after sign-out cannot restore the task or display success', async (t) => {
  const response = deferred();
  const { controller, store, notices, catalogLoads } = setup(t, {
    repository: { save: () => response.promise },
  });
  const publishing = controller.save('published');
  await settle();
  store.update(() => createInitialState());
  controller.reset();
  response.resolve({ id: 731, requestId, status: 'published' });
  assert.equal(await publishing, false);
  assert.equal(store.getState().taskSave.task, null);
  assert.deepEqual(store.getState().ownTasks.items, []);
  assert.deepEqual(notices, []);
  assert.deepEqual(catalogLoads, []);
});

test('late own-task load cannot populate a signed-out session', async (t) => {
  const response = deferred();
  const { controller, store } = setup(t, { repository: { mine: () => response.promise } });
  const loading = controller.loadMine();
  await settle();
  store.update(() => createInitialState());
  controller.reset();
  response.resolve([{ id: 731, requestId, card: { businessContact: 'private@example.com' } }]);
  await loading;
  assert.deepEqual(store.getState().ownTasks.items, []);
  assert.deepEqual(store.getState().catalog.items, []);
});

test('editing an owner task restores private card and persistent request ID without publishing', async (t) => {
  const { controller, store, routes, writes } = setup(t);
  const card = Object.fromEntries(
    Object.keys(fieldLabels).map((key) => [
      key,
      key === 'businessContact' ? 'private@example.com' : key,
    ]),
  );
  const task = {
    id: 731,
    requestId,
    card,
    originalDescription: 'Private original description',
    industry: 'Образование',
    direction: '',
    tags: [],
    score: null,
    status: 'draft',
  };
  store.update((state) => ({ ...state, ownTasks: { ...state.ownTasks, items: [task] } }));
  controller.edit('731');
  assert.equal(store.getState().taskSave.requestId, requestId);
  assert.equal(store.getState().taskSave.task.id, 731);
  assert.equal(store.getState().fields['Контакт бизнеса'], 'private@example.com');
  assert.equal(store.getState().description, task.originalDescription);
  assert.deepEqual(routes, ['editor']);
  assert.deepEqual(writes, []);
});
