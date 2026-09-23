import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialState } from '../src/app/initial-state.js';
import { createStore } from '../src/app/store.js';
import { fieldLabels, initialAnalysis } from '../src/services/ai/types.js';
import {
  createWorkspaceController,
  workspaceSnapshot,
} from '../src/features/tasks/workspace-controller.js';

const owner = 'c5928c6a-3e8a-41d5-aec4-baf6c07c5b2a';
const other = '681771bd-13bc-4641-9f0e-50e244ed82f0';
const requestId = '8609c107-b9be-4502-930d-94da84feb608';
const card = Object.fromEntries(
  Object.keys(fieldLabels).map((key) => [
    key,
    key === 'businessContact' ? 'private@example.com' : `${key}: свой ответ`,
  ]),
);
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
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
};

function setup(t, repository = {}) {
  const initial = createInitialState();
  initial.auth = {
    ...initial.auth,
    status: 'authenticated',
    user: { id: owner },
    profile: { id: owner, role: 'business' },
  };
  const store = createStore(initial);
  const writes = [];
  const controller = createWorkspaceController({
    store,
    repository: {
      loadWorkspace: async () => null,
      saveWorkspace: async (snapshot, options) => {
        writes.push({ snapshot: structuredClone(snapshot), options });
      },
      ...repository,
    },
    render() {},
    delayMs: 60_000,
  });
  t.after(() => controller.dispose());
  return { store, controller, writes };
}

function savedSnapshot() {
  return {
    version: 1,
    description: 'Наше приватное исходное описание задачи.',
    analysis: {
      step: 'questions',
      originalDescription: 'Наше приватное исходное описание задачи.',
      questions: [
        { id: 'contact', field: 'businessContact', text: 'Контакт?', reason: 'Уточнение' },
      ],
      answers: { contact: 'private@example.com' },
      currentQuestion: 0,
      analysisResult: null,
      knownInformation: [],
      missingInformation: [],
    },
    card,
    metadata: { industry: 'Образование', direction: 'Анализ', tags: ['Данные'] },
    requestId,
    taskId: 77,
    score: null,
    scoringResult: null,
  };
}

test('attachment source IDs and exclusions restore from the private workspace and new drafts isolate files', async (t) => {
  const snapshot = savedSnapshot();
  snapshot.attachments = { draftId: requestId, selectedIds: [] };
  snapshot.analysis.attachmentSources = [{ id: owner, name: 'Факты.txt' }];
  const { controller, store, writes } = setup(t, { loadWorkspace: async () => snapshot });
  await controller.load();
  assert.equal(store.getState().attachmentDraftId, requestId);
  assert.deepEqual(store.getState().attachmentSelectedIds, []);
  assert.deepEqual(
    store.getState().taskAnalysis.attachmentSources,
    snapshot.analysis.attachmentSources,
  );
  assert.deepEqual(workspaceSnapshot(store.getState()).attachments, snapshot.attachments);
  assert.deepEqual(writes, []);
  controller.newDraft();
  assert.notEqual(store.getState().attachmentDraftId, requestId);
  assert.deepEqual(store.getState().attachments.items, []);
  assert.deepEqual(store.getState().acceptedAttachmentIds, []);
  assert.equal(store.getState().taskAnalysis.attachmentSources, undefined);
  assert.equal(await controller.flush(), true);
  assert.deepEqual(writes.at(-1).snapshot.attachments.selectedIds, []);
});

test('empty workspace loads once without writing an empty document or public state', async (t) => {
  let reads = 0;
  const { controller, store, writes } = setup(t, {
    loadWorkspace: async ({ userId }) => {
      reads += 1;
      assert.equal(userId, owner);
      return null;
    },
  });
  await controller.load();
  await controller.load();
  assert.equal(reads, 1);
  assert.equal(store.getState().workspace.loaded, true);
  assert.equal(store.getState().workspace.status, 'ready');
  assert.equal(await controller.flush(), true);
  assert.deepEqual(writes, []);
  assert.deepEqual(store.getState().catalog.items, []);
});

test('restore includes private questionnaire answers, accepted card, metadata and persistent ID', async (t) => {
  const snapshot = savedSnapshot();
  const { controller, store, writes } = setup(t, {
    loadWorkspace: async () => structuredClone(snapshot),
  });
  await controller.load();
  const state = store.getState();
  assert.equal(state.description, snapshot.description);
  assert.deepEqual(state.taskAnalysis.answers, snapshot.analysis.answers);
  assert.deepEqual(state.taskAnalysis.questions, snapshot.analysis.questions);
  assert.equal(state.fields['Контакт бизнеса'], 'private@example.com');
  assert.equal(state.taskSave.task.id, 77);
  assert.equal(state.taskSave.requestId, requestId);
  assert.deepEqual(state.taskMetadata, snapshot.metadata);
  assert.deepEqual(state.catalog.items, []);
  assert.deepEqual(writes, []);
});

test('snapshot is an explicit private allowlist, preserving manual edits but not credentials or public cache', () => {
  const state = createInitialState();
  state.fields['Название'] = '  Ручной черновик  ';
  state.fields['Контакт бизнеса'] = 'private@example.com';
  state.auth = { accessToken: 'secret-token' };
  state.catalog.items = [{ id: 800, title: 'Публичная задача' }];
  const snapshot = workspaceSnapshot(state);
  assert.equal(snapshot.card.title, 'Ручной черновик');
  assert.equal(snapshot.card.businessContact, 'private@example.com');
  assert.equal(snapshot.card.successCriteria, null);
  assert.deepEqual(
    Object.keys(snapshot).sort(),
    [
      'version',
      'description',
      'analysis',
      'card',
      'metadata',
      'requestId',
      'taskId',
      'score',
      'scoringResult',
    ].sort(),
  );
  assert.doesNotMatch(JSON.stringify(snapshot), /secret-token|Публичная задача/);
});

test('flush waits for current write then saves the newest description and answers serially', async (t) => {
  const first = deferred();
  const writes = [];
  const { store, controller } = setup(t, {
    saveWorkspace: async (snapshot, options) => {
      writes.push({ snapshot: structuredClone(snapshot), options });
      if (writes.length === 1) await first.promise;
    },
  });
  await controller.load();
  store.update((state) => ({ ...state, description: 'Первая версия' }));
  const saving = controller.flush();
  await settle();
  assert.equal(writes.length, 1);
  store.update((state) => ({
    ...state,
    description: 'Последняя версия',
    taskAnalysis: { ...initialAnalysis(), answers: { data: 'Последний ответ' } },
  }));
  const concurrent = controller.flush();
  await settle();
  assert.equal(writes.length, 1);
  first.resolve();
  assert.equal(await saving, true);
  assert.equal(await concurrent, true);
  assert.equal(writes.length, 2);
  assert.equal(writes[1].snapshot.description, 'Последняя версия');
  assert.equal(writes[1].snapshot.analysis.answers.data, 'Последний ответ');
  assert.ok(writes.every((write) => write.options.userId === owner));
  assert.equal(store.getState().workspace.status, 'ready');
});

test('autosave debounces rapid edits into the latest private snapshot', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { store, controller, writes } = setup(t);
  await controller.load();
  store.update((state) => ({ ...state, description: 'Первый ввод' }));
  t.mock.timers.tick(30_000);
  store.update((state) => ({ ...state, description: 'Завершённый ввод' }));
  t.mock.timers.tick(59_999);
  await settle();
  assert.equal(writes.length, 0);
  t.mock.timers.tick(1);
  await settle();
  assert.equal(writes.length, 1);
  assert.equal(writes[0].snapshot.description, 'Завершённый ввод');
});

test('workspace never overwrites the database before a successful load and retries failed reads', async (t) => {
  let fail = true;
  const { store, controller, writes } = setup(t, {
    loadWorkspace: async () => {
      if (fail) throw new Error('Read offline');
      return null;
    },
  });
  store.update((state) => ({ ...state, description: 'Не загруженный черновик' }));
  assert.equal(await controller.flush(), false);
  await controller.load();
  assert.equal(store.getState().workspace.status, 'error');
  assert.equal(store.getState().workspace.loaded, false);
  assert.equal(await controller.flush(), false);
  assert.deepEqual(writes, []);
  fail = false;
  await controller.retry();
  assert.equal(store.getState().workspace.loaded, true);
});

test('save failure preserves answers and retries the latest snapshot', async (t) => {
  let fail = true;
  const snapshots = [];
  const { store, controller } = setup(t, {
    saveWorkspace: async (snapshot) => {
      snapshots.push(structuredClone(snapshot));
      if (fail) throw new Error('Write offline');
    },
  });
  await controller.load();
  store.update((state) => ({ ...state, description: 'Не потерять этот ответ' }));
  assert.equal(await controller.flush(), false);
  assert.equal(store.getState().workspace.status, 'error');
  assert.equal(store.getState().workspace.error, 'Write offline');
  assert.equal(store.getState().description, 'Не потерять этот ответ');
  fail = false;
  assert.equal(await controller.retry(), true);
  assert.deepEqual(snapshots[0], snapshots[1]);
});

test('late private load cannot populate a different account or public cache', async (t) => {
  const response = deferred();
  const { store, controller, writes } = setup(t, { loadWorkspace: () => response.promise });
  const loading = controller.load();
  await settle();
  store.update((state) => ({
    ...createInitialState(),
    auth: { ...state.auth, user: { id: other }, profile: { id: other, role: 'business' } },
  }));
  controller.reset();
  response.resolve(savedSnapshot());
  await loading;
  assert.equal(store.getState().description, '');
  assert.deepEqual(store.getState().catalog.items, []);
  assert.deepEqual(writes, []);
});

test('late save after sign-out cannot mark the new session saved or issue follow-up writes', async (t) => {
  const response = deferred();
  let count = 0;
  const { store, controller } = setup(t, {
    saveWorkspace: () => {
      count += 1;
      return response.promise;
    },
  });
  await controller.load();
  store.update((state) => ({ ...state, description: 'Приватный ответ' }));
  const saving = controller.flush();
  await settle();
  store.update(() => createInitialState());
  controller.reset();
  response.resolve();
  assert.equal(await saving, false);
  assert.equal(count, 1);
  assert.equal(store.getState().workspace.status, 'idle');
  assert.equal(store.getState().description, '');
});

test('transient generation stages restore to editable questions instead of a stuck spinner', () => {
  const state = createInitialState();
  state.taskAnalysis = { ...initialAnalysis(), step: 'generating' };
  assert.equal(workspaceSnapshot(state).analysis.step, 'questions');
  state.taskAnalysis = { ...initialAnalysis(), step: 'analyzing' };
  assert.equal(workspaceSnapshot(state).analysis.step, 'description');
});

test('unsaved detection covers local edits and in-flight writes but clears after successful persistence', async (t) => {
  const response = deferred();
  const { store, controller } = setup(t, { saveWorkspace: () => response.promise });
  assert.equal(controller.hasUnsaved(), false);
  await controller.load();
  assert.equal(controller.hasUnsaved(), false);
  store.update((state) => ({ ...state, description: 'Ответ перед закрытием вкладки' }));
  assert.equal(controller.hasUnsaved(), true);
  const saving = controller.flush();
  await settle();
  assert.equal(controller.hasUnsaved(), true);
  response.resolve();
  await saving;
  assert.equal(controller.hasUnsaved(), false);
});

test('unsaved warning persists after write errors and clears when private session resets', async (t) => {
  const { store, controller } = setup(t, {
    saveWorkspace: async () => {
      throw new Error('Offline');
    },
  });
  await controller.load();
  store.update((state) => ({ ...state, description: 'Не сохранено из-за сети' }));
  await controller.flush();
  assert.equal(controller.hasUnsaved(), true);
  controller.reset();
  assert.equal(controller.hasUnsaved(), false);
});
