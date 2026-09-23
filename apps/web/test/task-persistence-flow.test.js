import assert from 'node:assert/strict';
import test from 'node:test';
import {
  validateTask,
  validateTaskWrite,
  validateTaskWorkspace,
  TASK_CARD_FIELDS,
} from '@ai-sana/contracts';
import { createStore } from '../src/app/store.js';
import { createInitialState } from '../src/app/initial-state.js';
import { createWorkspaceController } from '../src/features/tasks/workspace-controller.js';
import { createPublicationController } from '../src/features/tasks/publication-controller.js';
import { createCatalogController } from '../src/features/tasks/catalog-controller.js';
import { createAnalysisController } from '../src/features/tasks/analysis-controller.js';
import { withMissingInformation } from '../src/services/ai/types.js';
import { createAuthActions } from '../src/features/auth/actions.js';

test('questionnaire survives reload, published card uses edits, and archived answers survive a new task', async (t) => {
  let persistedWorkspace = null;
  const rows = new Map();
  const owner = '11111111-1111-4111-8111-111111111111';
  const requestId = '22222222-2222-4222-8222-222222222222';
  const description = 'Образовательный центр хочет понять причины оттока учеников.';
  const questions = ['data', 'users', 'expectedResult'].map((field) => ({
    id: field,
    field,
    text: `Уточните ${field}`,
    reason: 'Для анализа',
  }));
  const generated = withMissingInformation({
    ...Object.fromEntries(TASK_CARD_FIELDS.map((field) => [field, null])),
    title: 'Понять причины оттока',
    context: description,
    need: 'Уменьшить отток',
    expectedResult: 'Отчёт с причинами',
    businessContact: 'private@example.test',
  });
  const repository = {
    async loadWorkspace({ userId }) {
      assert.equal(userId, owner);
      return structuredClone(persistedWorkspace);
    },
    async saveWorkspace(value, { userId }) {
      assert.equal(userId, owner);
      persistedWorkspace = validateTaskWorkspace(value);
      return structuredClone(persistedWorkspace);
    },
    async mine() {
      return structuredClone([...rows.values()]);
    },
    async list() {
      return [...rows.values()]
        .filter((task) => task.status === 'published')
        .map((task) => {
          const value = { ...task, card: { ...task.card, businessContact: null } };
          delete value.requestId;
          delete value.originalDescription;
          delete value.analysisSnapshot;
          return validateTask(value);
        });
    },
    async save(value, { userId }) {
      assert.equal(userId, owner);
      const input = validateTaskWrite(value);
      assert.equal(persistedWorkspace.requestId, input.requestId);
      const timestamp = '2026-09-23T00:00:00.000Z';
      const row = validateTask({
        id: rows.get(input.requestId)?.id || 52,
        title: input.card.title,
        description: input.card.need,
        industry: input.industry,
        direction: input.direction,
        tags: input.tags,
        score: input.score,
        reply: 0,
        card: input.card,
        status: input.status,
        createdAt: timestamp,
        updatedAt: timestamp,
        publishedAt: input.status === 'published' ? timestamp : null,
        originalDescription: input.description,
        requestId: input.requestId,
        analysisSnapshot: structuredClone(persistedWorkspace),
      });
      rows.set(input.requestId, row);
      return structuredClone(row);
    },
  };
  function client() {
    const initial = createInitialState();
    initial.auth = {
      ...initial.auth,
      status: 'authenticated',
      user: { id: owner },
      profile: { id: owner, role: 'business' },
    };
    const store = createStore(initial);
    const router = { render() {}, navigate() {} };
    const workspace = createWorkspaceController({ store, repository, render() {}, delayMs: 60000 });
    const catalog = createCatalogController({ store, repository, render() {} });
    const publication = createPublicationController({
      store,
      repository,
      catalog,
      workspace,
      router,
      feedback: { toast() {}, success() {}, closeModal() {} },
      createId: () => requestId,
    });
    const analysis = createAnalysisController({
      store,
      workspace,
      router,
      scoring: { score() {} },
      service: {
        async analyzeTaskDescription() {
          return { questions, knownInformation: [description], missingInformation: ['data'] };
        },
        async generateTaskFromAnswers(original, receivedQuestions, answers) {
          assert.equal(original, description);
          assert.deepEqual(receivedQuestions, questions);
          assert.equal(answers.data, 'Приватные данные из CRM');
          return structuredClone(generated);
        },
      },
    });
    const dispose = () => {
      workspace.dispose();
      publication.dispose();
      catalog.dispose();
    };
    t.after(dispose);
    return { store, workspace, analysis, publication, catalog, dispose };
  }
  const first = client();
  await first.workspace.load();
  first.store.update((state) => ({ ...state, description }));
  await first.analysis.actions.analyze();
  first.analysis.setAnswer('data', 'Приватные данные из CRM');
  await first.analysis.actions['analysis-next']();
  await first.workspace.flush();
  first.dispose();
  const second = client();
  await second.workspace.load();
  assert.equal(second.store.getState().taskAnalysis.currentQuestion, 1);
  assert.equal(second.store.getState().taskAnalysis.answers.data, 'Приватные данные из CRM');
  second.analysis.setAnswer('users', 'Аналитики');
  await second.analysis.actions['analysis-next']();
  second.analysis.setAnswer('expectedResult', 'Аналитический отчёт');
  await second.analysis.actions['analysis-next']();
  second.analysis.actions['analysis-accept']();
  second.store.update((state) => ({
    ...state,
    fields: { ...state.fields, Название: 'Отредактированная задача' },
  }));
  assert.equal(await second.publication.save('published'), true);
  assert.equal(rows.size, 1);
  assert.equal(second.store.getState().catalog.items[0].id, 52);
  assert.equal(second.store.getState().catalog.items[0].title, 'Отредактированная задача');
  assert.doesNotMatch(
    JSON.stringify(second.store.getState().catalog),
    /private@example|Приватные данные из CRM|analysisSnapshot/,
  );
  second.workspace.newDraft();
  await second.workspace.flush();
  assert.deepEqual(persistedWorkspace.analysis.answers, {});
  second.publication.edit(52);
  assert.equal(second.store.getState().taskAnalysis.answers.data, 'Приватные данные из CRM');
  assert.equal(second.store.getState().fields['Название'], 'Отредактированная задача');
  assert.equal(second.store.getState().taskSave.requestId, requestId);
});

test('manual logout waits for dirty answers and requires an explicit discard after save failure', async () => {
  let signedOut = 0;
  let succeeded = false;
  let modal = '';
  const actions = createAuthActions({
    authController: {
      async logout() {
        signedOut += 1;
      },
    },
    workspace: { hasUnsaved: () => true, flush: async () => succeeded },
    store: createStore(createInitialState()),
    feedback: {
      modal(value) {
        modal = value;
      },
    },
  });
  await actions.logout();
  assert.equal(signedOut, 0);
  assert.match(modal, /force-logout/);
  succeeded = true;
  await actions.logout();
  assert.equal(signedOut, 1);
});
