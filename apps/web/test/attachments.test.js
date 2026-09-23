import assert from 'node:assert/strict';
import test from 'node:test';
import { createAttachmentsController } from '../src/features/attachments/controller.js';
import { createAttachmentsClient } from '../src/features/attachments/service.js';
import { createAnalysisController } from '../src/features/tasks/analysis-controller.js';
import { attachmentsPanel } from '../src/components/attachments.js';
import { createStore } from '../src/app/store.js';
import { createInitialState } from '../src/app/initial-state.js';
import { createTaskAnalysisService } from '../src/services/ai/taskAnalysis.js';

const owner = '11111111-1111-4111-8111-111111111111';
const draft = '22222222-2222-4222-8222-222222222222';
const id = '33333333-3333-4333-8333-333333333333';
const extraction = {
  summary: 'Факты',
  facts: [{ text: 'У центра есть данные', source: 'Страница 1' }],
  warnings: [],
};
const saved = {
  id,
  draft_id: draft,
  name: 'test.txt',
  size_bytes: 20,
  storage_path: `${owner}/${draft}/${id}.txt`,
};
function setup(service = {}) {
  const store = createStore({
    ...createInitialState(),
    auth: { status: 'authenticated', user: { id: owner }, profile: { role: 'business' } },
  });
  let sequence = 0;
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key),
    setItem: (key, value) => values.set(key, value),
  };
  const controller = createAttachmentsController({
    store,
    render() {},
    storage,
    uuid: () => (sequence++ ? id : draft),
    service: {
      list: async () => [],
      upload: async () => saved,
      analyze: async () => ({ ...saved, extracted_context: extraction }),
      remove: async () => ({}),
      ...service,
    },
  });
  return { store, controller, storage };
}

test('upload/extraction can be inspected, excluded and deleted without changing description', async () => {
  const { store, controller, storage } = setup();
  await controller.load();
  await controller.add([new File(['Текст документа'], 'test.txt')]);
  assert.equal(store.getState().attachments.items[0].status, 'ready');
  assert.equal(store.getState().attachments.items[0].selected, true);
  assert.match(attachmentsPanel(store.getState()), /У центра есть данные/);
  assert.equal(storage.getItem(`ai-sana:attachment-draft:${owner}`), draft);
  controller.toggle(id, false);
  assert.equal(store.getState().attachments.items[0].selected, false);
  await controller.remove(id);
  assert.equal(store.getState().attachments.items.length, 0);
  assert.equal(store.getState().description, '');
});

test('invalid formats and duplicates are visible, extraction errors can be retried without reupload', async () => {
  let uploads = 0,
    attempts = 0;
  const { store, controller } = setup({
    upload: async () => {
      uploads++;
      return saved;
    },
    analyze: async () => {
      if (!attempts++) throw new Error('Timeout');
      return { ...saved, extracted_context: extraction };
    },
  });
  await controller.load();
  await controller.add([new File(['text'], 'bad.exe')]);
  assert.match(store.getState().attachments.error, /Поддерживаются/);
  await controller.add([new File(['text'], 'test.txt')]);
  assert.equal(store.getState().attachments.items[0].status, 'error');
  assert.equal(store.getState().attachments.items[0].selected, false);
  await controller.retry(id);
  assert.equal(uploads, 1);
  assert.equal(store.getState().attachments.items[0].status, 'ready');
});

test('stored attachment context restores and an old account request cannot populate a new session', async () => {
  let finish;
  const s = setup({
    list: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  });
  const pending = s.controller.load();
  s.store.update(() => createInitialState());
  finish([{ ...saved, extracted_context: extraction }]);
  await pending;
  assert.equal(s.store.getState().attachments, undefined);
  const ready = setup({ list: async () => [{ ...saved, extracted_context: extraction }] });
  await ready.controller.load();
  assert.equal(ready.store.getState().attachments.items[0].selected, true);
});

test('file-only task analysis captures selected attachment IDs for questions and generation', async () => {
  const { store, controller } = setup({
    list: async () => [{ ...saved, extracted_context: extraction }],
  });
  await controller.load();
  const calls = [];
  const questions = ['data', 'users', 'constraints'].map((field) => ({
    id: field,
    field,
    text: 'Вопрос',
    reason: 'Уточнение',
  }));
  const analysis = createAnalysisController({
    store,
    router: { render() {}, navigate() {} },
    scoring: { score() {} },
    service: {
      analyzeTaskDescription: async (...args) => {
        calls.push(args);
        return { questions, knownInformation: [], missingInformation: [] };
      },
      generateTaskFromAnswers: async (...args) => {
        calls.push(args);
        return {};
      },
    },
  });
  await analysis.actions.analyze();
  assert.deepEqual(calls[0][1], [id]);
  assert.ok(calls[0][0].length >= 20);
  controller.toggle(id, false);
  for (let i = 0; i < 3; i++) await analysis.actions['analysis-next']();
  assert.deepEqual(calls[1][3], [id]);
});

test('attachment and analysis clients send current access token but never storage URLs as model input', async () => {
  const calls = [];
  const client = {
    request: async (path, options) => {
      calls.push({ path, options });
      return [];
    },
  };
  await createAttachmentsClient({ getAccessToken: async () => 'token', client }).list(draft);
  assert.equal(calls[0].options.headers.Authorization, 'Bearer token');
  const ai = createTaskAnalysisService({
    getAccessToken: async () => 'refreshed',
    client: {
      request: async (path, options) => {
        calls.push({ path, options });
        return {
          questions: ['data', 'users', 'constraints'].map((field) => ({
            id: field,
            field,
            text: 'Вопрос',
            reason: 'Зачем',
          })),
          knownInformation: [],
          missingInformation: [],
        };
      },
    },
  });
  await ai.analyzeTaskDescription('Описание задачи для анализа вложений.', [id]);
  assert.equal(calls[1].options.headers.Authorization, 'Bearer refreshed');
  assert.deepEqual(JSON.parse(calls[1].options.body).attachmentIds, [id]);
  assert.equal(JSON.parse(calls[1].options.body).attachedDocuments, undefined);
});

test('filenames, extracted facts and error messages are escaped', () => {
  const { store } = setup();
  store.update((s) => ({
    ...s,
    attachments: {
      status: 'ready',
      error: '<script>x</script>',
      items: [
        {
          ...saved,
          name: '<img src=x>',
          status: 'ready',
          extracted_context: { summary: '<script>y</script>', facts: [], warnings: [] },
        },
      ],
    },
  }));
  const html = attachmentsPanel(store.getState());
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<img src=x>'));
  assert.match(html, /&lt;script&gt;/);
});
