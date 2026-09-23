import assert from 'node:assert/strict';
import test from 'node:test';
import {
  TASK_CARD_FIELDS,
  validateTask,
  validateTaskWrite,
  validateTaskWorkspace,
} from '../src/index.js';

const requestId = '550e8400-e29b-41d4-a716-446655440000';
const card = Object.fromEntries(
  TASK_CARD_FIELDS.map((key) => [key, key === 'title' ? 'Название' : null]),
);
const draft = { requestId, status: 'draft', description: '', card };
const workspace = () => ({
  version: 1,
  description: 'Описание',
  analysis: {
    step: 'questions',
    originalDescription: 'Описание',
    questions: [{ id: 'q1', field: 'data', text: 'Какие данные?', reason: 'Нужно уточнить' }],
    answers: { q1: 'Таблица' },
    currentQuestion: 0,
    analysisResult: null,
    knownInformation: ['Факт'],
    missingInformation: ['data'],
  },
  card: null,
  metadata: { industry: '', direction: '', tags: [] },
  requestId: null,
  taskId: null,
  score: null,
  scoringResult: null,
});

test('task writes permit nullable fields and score but enforce publication readiness', () => {
  assert.equal(validateTaskWrite(draft).score, null);
  assert.deepEqual(validateTaskWrite(draft).tags, []);
  assert.throws(() => validateTaskWrite({ ...draft, status: 'published' }));
  const published = validateTaskWrite({
    ...draft,
    status: 'published',
    description: 'Подробное описание задачи бизнеса',
    card: { ...card, need: 'Потребность', expectedResult: 'Отчёт' },
  });
  assert.equal(published.card.businessContact, null);
});

test('write contract rejects owner spoofing, private IDs, malformed and oversized values', () => {
  for (const value of [
    { ...draft, owner_id: requestId },
    { ...draft, id: 1 },
    { ...draft, requestId: 'x' },
    { ...draft, status: 'deleted' },
    { ...draft, description: 'x'.repeat(10_001) },
    { ...draft, card: { ...card, title: '' } },
    { ...draft, card: { ...card, title: 'x'.repeat(201) } },
    { ...draft, card: { ...card, secret: true } },
    { ...draft, score: 0.5 },
    { ...draft, tags: ['x'.repeat(51)] },
    { ...draft, tags: Array(11).fill('x') },
    { ...draft, industry: 'x'.repeat(101) },
    { ...draft, card: { ...card, need: {} } },
  ])
    assert.throws(() => validateTaskWrite(value), TypeError);
});

test('public task DTO accepts null readiness and empty classification without private passthrough', () => {
  const value = validateTask({
    id: 1,
    title: 'Task',
    description: '',
    industry: '',
    direction: '',
    score: null,
    reply: 0,
    tags: [],
    card,
    status: 'draft',
    createdAt: '2026-09-23T00:00:00.000Z',
    updatedAt: '2026-09-23T00:00:00.000Z',
    publishedAt: null,
    owner_id: requestId,
    credentials: 'never',
  });
  assert.equal(value.score, null);
  assert.equal(value.owner_id, undefined);
  assert.equal(value.credentials, undefined);
});

test('workspace DTO roundtrips all questionnaire answers and empty accepted card safely', () => {
  const source = workspace();
  source.card = { ...card, title: null };
  source.analysis.analysisResult = { ...card, title: null, missingInformation: ['title'] };
  const result = validateTaskWorkspace(source);
  assert.deepEqual(result, source);
  result.analysis.answers.q1 = 'Changed';
  assert.equal(source.analysis.answers.q1, 'Таблица');
});

test('workspace DTO rejects arbitrary auth state, unexpected answers, nested fields and invalid bounds', () => {
  const mutations = [
    (v) => {
      v.auth = { token: 'secret' };
    },
    (v) => {
      v.analysis.answers.unknown = 'hidden';
    },
    (v) => {
      v.analysis.questions[0].token = 'secret';
    },
    (v) => {
      v.analysis.questions.push(v.analysis.questions[0]);
    },
    (v) => {
      v.analysis.currentQuestion = 2;
    },
    (v) => {
      v.analysis.missingInformation = ['secret'];
    },
    (v) => {
      v.analysis.answers.q1 = 'x'.repeat(10_001);
    },
    (v) => {
      v.metadata.owner_id = requestId;
    },
    (v) => {
      v.requestId = 'bad';
    },
    (v) => {
      v.score = 101;
    },
    (v) => {
      v.version = '1';
    },
    (v) => {
      v.scoringResult = { score: 99, summary: 'x', criteria: [] };
    },
  ];
  for (const mutate of mutations) {
    const value = workspace();
    mutate(value);
    assert.throws(() => validateTaskWorkspace(value), TypeError);
  }
});
