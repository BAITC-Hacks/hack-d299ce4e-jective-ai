import assert from 'node:assert/strict';
import test from 'node:test';
import { createScoringController } from '../src/features/tasks/scoring-controller.js';
import { createTaskAnalysisService } from '../src/services/ai/taskAnalysis.js';
import { createStore } from '../src/app/store.js';
import { createInitialState } from '../src/app/initial-state.js';
import { editor } from '../src/pages/task-editor.js';

const result = {
  score: 0,
  summary: 'Недостаточно конкретики',
  criteria: [20, 10, 15, 15, 20, 10, 10].map((maxScore, i) => ({
    id: String(i),
    label: 'Критерий',
    maxScore,
    score: 0,
    explanation: '<script>Слишком общо</script>',
    recommendation: 'Уточните результат',
  })),
};

test('scoring sends current card, displays model feedback, and rejects invalid totals', async () => {
  const store = createStore(createInitialState());
  let payload;
  const service = createTaskAnalysisService({
    getAccessToken: async () => 'token',
    client: {
      async request(path, options) {
        assert.equal(path, 'ai/task-analysis/score');
        assert.equal(options.headers.Authorization, 'Bearer token');
        payload = JSON.parse(options.body);
        return result;
      },
    },
  });
  const scoring = createScoringController({ store, router: { render() {} }, service });
  const pending = scoring.score();
  assert.equal(store.getState().rating, null);
  await pending;
  assert.equal(payload.card.context, null);
  assert.equal(store.getState().rating, 0);
  assert.match(editor(store.getState()), /Уточните результат/);
  assert.match(editor(store.getState()), /&lt;script&gt;/);
  assert.ok(!editor(store.getState()).includes('<script>'));
  const invalid = createTaskAnalysisService({
    getAccessToken: async () => 'token',
    client: { request: async () => ({ ...result, score: 100 }) },
  });
  await assert.rejects(invalid.scoreTask(payload.card));
});

test('late scoring responses cannot overwrite a newer edited card; errors preserve fields', async () => {
  const store = createStore(createInitialState());
  const pending = [];
  const scoring = createScoringController({
    store,
    router: { render() {} },
    service: {
      scoreTask: () => new Promise((resolve, reject) => pending.push({ resolve, reject })),
    },
  });
  const oldRequest = scoring.score();
  store.update((state) => ({
    ...state,
    fields: { ...state.fields, Контекст: 'Изменённая карточка' },
  }));
  const newRequest = scoring.score();
  pending[1].resolve({ ...result, summary: 'Новая оценка' });
  await newRequest;
  pending[0].resolve({ ...result, summary: 'Старая оценка' });
  await oldRequest;
  assert.equal(store.getState().aiScoring.result.summary, 'Новая оценка');
  const failed = scoring.score();
  pending[2].reject(new Error('Timeout'));
  await failed;
  assert.equal(store.getState().aiScoring.status, 'error');
  assert.equal(store.getState().rating, null);
  assert.equal(store.getState().fields['Контекст'], 'Изменённая карточка');
});
