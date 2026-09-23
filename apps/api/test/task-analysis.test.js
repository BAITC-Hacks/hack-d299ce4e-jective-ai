import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import test from 'node:test';
import { createApp } from '../src/app.js';
import { rubric, validateScoring } from '../src/modules/task-analysis/scoring.js';
import { createTaskAnalysisService, fields } from '../src/modules/task-analysis/service.js';

const description = 'Образовательный центр хочет выяснить причины оттока учеников.';
const questions = ['data', 'users', 'successCriteria'].map((field) => ({
  id: field,
  field,
  text: `Вопрос о ${field}`,
  reason: 'Уточнение задачи',
}));
const analysis = { knownInformation: [description], missingInformation: ['data'], questions };
const result = {
  ...Object.fromEntries(fields.map((key) => [key, null])),
  title: 'Причины оттока учеников',
  context: description,
  missingInformation: [],
};
const completed = (value) => ({
  status: 'completed',
  output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(value) }] }],
});

async function request(app, operation, body, { method = 'POST', type = 'application/json' } = {}) {
  const req = Readable.from([typeof body === 'string' ? body : JSON.stringify(body)]);
  Object.assign(req, {
    method,
    url: `/api/ai/task-analysis/${operation}`,
    headers: { 'content-type': type },
  });
  const res = new EventEmitter();
  res.writeHead = (status, headers) => Object.assign(res, { status, headers });
  res.end = (body) => {
    res.body = body;
    res.writableEnded = true;
  };
  await app(req, res);
  return { status: res.status, headers: res.headers, json: res.body ? JSON.parse(res.body) : null };
}

test('HTTP routes call OpenAI Responses with strict schemas and keep secrets server-side', async () => {
  const calls = [];
  const service = createTaskAnalysisService({
    apiKey: 'test-secret',
    fetchImpl: async (url, options) => {
      calls.push({ url, ...options, body: JSON.parse(options.body) });
      return Response.json(completed(calls.length === 1 ? analysis : result));
    },
  });
  const app = createApp({ analysisService: service });
  const first = await request(app, 'questions', { description });
  assert.equal(first.status, 200);
  assert.deepEqual(first.json.data, analysis);
  const answers = { data: 'Есть посещаемость', users: '', successCriteria: 'Не знаю' };
  const second = await request(app, 'generate', { description, questions, answers });
  assert.equal(second.status, 200);
  assert.equal(second.json.data.constraints, null);
  assert.ok(second.json.data.missingInformation.includes('constraints'));
  for (const call of calls) {
    assert.equal(call.url, 'https://api.openai.com/v1/responses');
    assert.equal(call.headers.Authorization, 'Bearer test-secret');
    assert.equal(call.body.text.format.strict, true);
    assert.equal(call.body.store, false);
    assert.match(call.body.instructions, /Never invent business facts/);
    assert.equal(call.body.text.format.schema.additionalProperties, false);
  }
  assert.deepEqual(JSON.parse(calls[1].body.input), {
    description,
    clarifications: questions.map((q) => ({ question: q.text, answer: answers[q.id] })),
  });
  assert.ok(!JSON.stringify(second).includes('test-secret'));
});

test('bad bodies, unsupported methods, missing keys and invalid answers never reach OpenAI', async () => {
  let calls = 0;
  const service = createTaskAnalysisService({
    apiKey: '',
    fetchImpl: async () => {
      calls++;
    },
  });
  const app = createApp({ analysisService: service });
  for (const [operation, body, options, status, code] of [
    ['questions', { description }, { method: 'GET' }, 405, 'METHOD_NOT_ALLOWED'],
    ['questions', { description }, { type: 'text/plain' }, 415, 'UNSUPPORTED_MEDIA_TYPE'],
    ['questions', '{', {}, 400, 'INVALID_JSON'],
    ['questions', 'x'.repeat(128 * 1024 + 1), {}, 413, 'BODY_TOO_LARGE'],
    ['questions', { description: 'Short' }, {}, 400, 'INVALID_DESCRIPTION'],
    ['generate', { description, questions: [], answers: {} }, {}, 400, 'INVALID_ANSWERS'],
    ['generate', { description, questions, answers: { data: 123 } }, {}, 400, 'INVALID_ANSWERS'],
    ['questions', { description }, {}, 503, 'AI_NOT_CONFIGURED'],
  ]) {
    const response = await request(app, operation, body, options);
    assert.equal(response.status, status);
    assert.equal(response.json.error.code, code);
    if (status === 405) assert.equal(response.headers.Allow, 'POST');
  }
  assert.equal(calls, 0);
});

test('provider authentication, quota and network failures have safe actionable messages', async () => {
  for (const [status, code] of [
    [401, 'AI_AUTH_ERROR'],
    [403, 'AI_AUTH_ERROR'],
    [429, 'AI_RATE_LIMIT'],
    [500, 'AI_UNAVAILABLE'],
    [400, 'AI_CONFIGURATION_ERROR'],
  ]) {
    const service = createTaskAnalysisService({
      apiKey: 'test-secret',
      fetchImpl: async () => Response.json({ error: { message: 'test-secret' } }, { status }),
    });
    await assert.rejects(
      service.run('questions', { description }),
      (error) => error.code === code && !error.message.includes('test-secret'),
    );
  }
  const service = createTaskAnalysisService({
    apiKey: 'test-secret',
    fetchImpl: async () => {
      throw new Error('test-secret');
    },
  });
  await assert.rejects(service.run('questions', { description }), { code: 'AI_UNAVAILABLE' });
});

test('refusal, incomplete output, invalid JSON and invalid structured content fail without a mock fallback', async () => {
  for (const [payload, code] of [
    [
      { status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal' }] }] },
      'AI_REFUSAL',
    ],
    [{ status: 'incomplete', output: [] }, 'AI_INVALID_RESPONSE'],
    [
      {
        status: 'completed',
        output: [{ type: 'message', content: [{ type: 'output_text', text: '{' }] }],
      },
      'AI_INVALID_RESPONSE',
    ],
    [completed({ ...analysis, questions: [] }), 'AI_INVALID_RESPONSE'],
    [
      completed({ ...analysis, questions: [questions[0], questions[0], questions[0]] }),
      'AI_INVALID_RESPONSE',
    ],
  ]) {
    const service = createTaskAnalysisService({
      apiKey: 'test',
      fetchImpl: async () => Response.json(payload),
    });
    await assert.rejects(service.run('questions', { description }), { code });
  }
  const service = createTaskAnalysisService({
    apiKey: 'test',
    fetchImpl: async () => Response.json(completed({})),
  });
  await assert.rejects(service.run('generate', { description, questions, answers: {} }), {
    code: 'AI_INVALID_RESPONSE',
  });
});

test('upstream timeout aborts the OpenAI request', async () => {
  let aborted = false;
  const service = createTaskAnalysisService({
    apiKey: 'test',
    timeoutMs: 5,
    fetchImpl: async (_url, { signal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          aborted = true;
          reject(new Error('Aborted'));
        });
      }),
  });
  await assert.rejects(service.run('questions', { description }), { code: 'AI_TIMEOUT' });
  assert.equal(aborted, true);
});

test('AI scoring uses a separate quality rubric, validates bounds and computes the total server-side', async () => {
  const evaluation = {
    summary: 'Есть существенные пробелы',
    criteria: Object.fromEntries(
      rubric.map((r) => [
        r.id,
        { score: 1, explanation: 'Слишком общо', recommendation: 'Добавьте конкретику' },
      ]),
    ),
  };
  let sent;
  const service = createTaskAnalysisService({
    apiKey: 'test',
    fetchImpl: async (_url, options) => {
      sent = JSON.parse(options.body);
      return Response.json(completed(evaluation));
    },
  });
  const response = await request(createApp({ analysisService: service }), 'score', {
    card: result,
  });
  assert.equal(response.status, 200);
  assert.equal(response.json.data.score, 7);
  assert.equal(response.json.data.criteria.length, 7);
  assert.match(sent.instructions, /Do not use field count/);
  assert.equal(sent.text.format.name, 'task_score');
  assert.equal(JSON.parse(sent.input).card.title, result.title);
  assert.throws(() =>
    validateScoring({
      ...evaluation,
      criteria: {
        ...evaluation.criteria,
        problem: { score: 21, explanation: 'x', recommendation: 'y' },
      },
    }),
  );
  assert.throws(() => validateScoring({ summary: 'x', criteria: {} }));
  assert.equal(
    (await request(createApp({ analysisService: service }), 'score', { card: {} })).status,
    400,
  );
});

test('model chooses variable question counts beyond eight, with a strict minimum of three', async () => {
  for (const count of [3, 6, 12]) {
    const many = Array.from({ length: count }, (_, i) => ({ ...questions[i % 3], id: `q${i}` }));
    const service = createTaskAnalysisService({
      apiKey: 'test',
      fetchImpl: async (_url, options) => {
        const body = JSON.parse(options.body);
        assert.match(body.instructions, /Strongly prefer more than 5/);
        assert.equal(body.text.format.schema.properties.questions.minItems, 3);
        assert.equal(body.text.format.schema.properties.questions.maxItems, undefined);
        return Response.json(completed({ ...analysis, questions: many }));
      },
    });
    const response = await service.run('questions', { description });
    assert.equal(response.questions.length, count);
  }
});
