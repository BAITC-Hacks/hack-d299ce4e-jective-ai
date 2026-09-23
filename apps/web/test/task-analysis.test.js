import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createTaskAnalysisService,
  validateQuestions,
  validateResult,
} from '../src/services/ai/taskAnalysis.js';
import { createAnalysisController } from '../src/features/tasks/analysis-controller.js';
import { createStore } from '../src/app/store.js';
import { createInitialState } from '../src/app/initial-state.js';
import { create, editor } from '../src/pages/task-editor.js';

const description = 'Мы образовательный центр, хотим понять причины оттока учеников.';
const questions = ['data', 'users', 'expectedResult', 'successCriteria', 'constraints'].map(
  (field) => ({ id: field, field, text: `Уточните ${field}`, reason: 'Для проверки задачи' }),
);
const result = {
  title: null,
  context: description,
  need: null,
  users: null,
  data: 'Посещаемость',
  constraints: null,
  expectedResult: null,
  successCriteria: null,
  businessContact: null,
  interactionFormat: null,
  missingInformation: ['constraints'],
};
const calls = [];
const service = createTaskAnalysisService({
  client: {
    async request(path, options) {
      calls.push({ path, body: JSON.parse(options.body) });
      return path.endsWith('/questions')
        ? { knownInformation: [description], missingInformation: ['data'], questions }
        : structuredClone(result);
    },
  },
});

test('both steps call the backend with the original description and all answers', async () => {
  calls.length = 0;
  const first = await service.analyzeTaskDescription(description);
  const answers = { data: 'Посещаемость', constraints: 'Не знаю' };
  const generated = await service.generateTaskFromAnswers(description, first.questions, answers);
  assert.deepEqual(calls, [
    { path: 'ai/task-analysis/questions', body: { description } },
    { path: 'ai/task-analysis/generate', body: { description, questions, answers } },
  ]);
  assert.equal(generated.constraints, null);
  assert.ok(generated.missingInformation.includes('constraints'));
});

test('invalid descriptions, questions and final responses fail explicitly', async () => {
  for (const input of ['', 'коротко']) await assert.rejects(service.analyzeTaskDescription(input));
  for (const value of [null, {}, { questions: [] }]) assert.throws(() => validateQuestions(value));
  for (const value of [null, {}, { title: 'Partial' }]) assert.throws(() => validateResult(value));
  const api = createTaskAnalysisService({
    client: { request: async () => ({ questions: [] }) },
  });
  await assert.rejects(api.analyzeTaskDescription(description));
});

test('full flow stays in create until acceptance; edits, missing fields and answers survive navigation', async () => {
  const store = createStore({ ...createInitialState(), description });
  const routes = [];
  const controller = createAnalysisController({
    store,
    service,
    scoring: { score() {} },
    router: {
      render() {},
      navigate(route) {
        routes.push(route);
      },
    },
  });
  const request = controller.actions.analyze();
  assert.match(create(store.getState()), /AI анализирует вашу задачу/);
  await request;
  assert.match(create(store.getState()), /Вопрос 1 из 5/);
  controller.setAnswer('data', '<script>Данные</script>');
  controller.actions['analysis-next']();
  controller.actions['analysis-back']();
  assert.equal(store.getState().taskAnalysis.answers.data, '<script>Данные</script>');
  assert.ok(!create(store.getState()).includes('<script>Данные</script>'));
  for (let i = 0; i < 4; i++) controller.actions['analysis-next']();
  const generation = controller.actions['analysis-next']();
  assert.match(create(store.getState()), /AI формирует карточку задачи/);
  await generation;
  assert.match(create(store.getState()), /Принять результат/);
  assert.match(create(store.getState()), /Что ещё желательно уточнить/);
  controller.actions['analysis-questions']();
  assert.equal(store.getState().taskAnalysis.answers.data, '<script>Данные</script>');
  for (let i = 0; i < 5; i++) await controller.actions['analysis-next']();
  controller.setResultField('title', 'Отток учеников');
  assert.ok(!store.getState().taskAnalysis.analysisResult.missingInformation.includes('title'));
  assert.deepEqual(routes, []);
  assert.equal(store.getState().published, false);
  controller.actions['analysis-accept']();
  assert.deepEqual(routes, ['editor']);
  assert.equal(store.getState().fields['Название'], 'Отток учеников');
  assert.match(editor(store.getState()), /<h2>Отток учеников<\/h2>/);
  assert.ok(!editor(store.getState()).includes('FinTech'));
  assert.equal(store.getState().published, false);
});

test('AI failures preserve input and retry the failed operation', async () => {
  const store = createStore({ ...createInitialState(), description });
  let fail = true;
  const controller = createAnalysisController({
    store,
    router: { render() {}, navigate() {} },
    service: {
      ...service,
      async analyzeTaskDescription(value) {
        if (fail) throw new Error('Timeout');
        return service.analyzeTaskDescription(value);
      },
      async generateTaskFromAnswers() {
        throw new Error('Invalid JSON');
      },
    },
  });
  await controller.actions.analyze();
  assert.equal(store.getState().taskAnalysis.step, 'error');
  assert.equal(store.getState().description, description);
  fail = false;
  await controller.actions['analysis-retry']();
  controller.setAnswer('data', 'Исходные данные');
  for (let i = 0; i < 5; i++) await controller.actions['analysis-next']();
  assert.equal(store.getState().taskAnalysis.retry, 'generating');
  await controller.actions['analysis-retry']();
  assert.equal(store.getState().taskAnalysis.answers.data, 'Исходные данные');
  assert.match(create(store.getState()), /Не удалось выполнить AI-анализ/);
});
