import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import test from 'node:test';
import { TASK_CARD_FIELDS } from '@ai-sana/contracts';
import { createApp } from '../src/app.js';
import { createSupabaseTaskRepository } from '../src/modules/tasks/repository.js';
import { HttpError } from '../src/shared/http-error.js';

const ownerA = '550e8400-e29b-41d4-a716-446655440000';
const ownerB = '550e8400-e29b-41d4-a716-446655440001';
const requestId = '550e8400-e29b-41d4-a716-446655440002';
const config = { url: 'https://example.supabase.co', publishableKey: 'sb_publishable_test' };
const card = Object.fromEntries(TASK_CARD_FIELDS.map((key) => [key, null]));
const draft = () => ({
  requestId,
  status: 'draft',
  description: 'Подробное описание пользовательской задачи',
  card: {
    ...card,
    title: 'Моя задача',
    need: 'Нужен анализ',
    expectedResult: 'Получить отчёт',
    businessContact: 'private@example.com',
  },
  industry: '',
  direction: '',
  tags: [],
  score: null,
});
const snapshot = () => ({
  version: 1,
  description: 'Частный черновик',
  analysis: {
    step: 'questions',
    originalDescription: 'Частное описание',
    questions: [{ id: 'q1', field: 'data', text: 'Что есть?', reason: 'Уточнение' }],
    answers: { q1: 'Частный ответ' },
    currentQuestion: 0,
    analysisResult: null,
    knownInformation: [],
    missingInformation: ['data'],
  },
  card: null,
  metadata: { industry: '', direction: '', tags: [] },
  requestId: null,
  taskId: null,
  score: null,
  scoringResult: null,
});
const authService = {
  async getCurrentUser(request) {
    const token = request.headers?.authorization;
    if (!['Bearer aaa.bbb.ccc', 'Bearer bbb.bbb.ccc', 'Bearer sss.bbb.ccc'].includes(token))
      throw new HttpError(401, 'UNAUTHORIZED', 'Sign in.');
    const id = token.includes('bbb.bbb') ? ownerB : ownerA;
    return { user: { id }, profile: { id, role: token.includes('sss.') ? 'student' : 'business' } };
  },
};

async function request(
  app,
  url,
  { method = 'GET', body, token = 'aaa.bbb.ccc', type = 'application/json' } = {},
) {
  const req = Readable.from(
    body === undefined ? [] : [typeof body === 'string' ? body : JSON.stringify(body)],
  );
  Object.assign(req, {
    method,
    url,
    headers: { 'content-type': type, ...(token ? { authorization: `Bearer ${token}` } : {}) },
  });
  const res = new EventEmitter();
  res.writeHead = (status, headers) => Object.assign(res, { status, headers });
  res.end = (text) => {
    res.body = text;
    res.writableEnded = true;
  };
  await app(req, res);
  return { ...res, json: res.body ? JSON.parse(res.body) : null };
}

/** Small SQL-like adapter to exercise the actual Supabase query builder calls. */
function database({ seedWorkspace = true } = {}) {
  const tables = {
    tasks: [],
    task_workspaces: seedWorkspace
      ? [ownerA, ownerB].map((owner_id) => ({ owner_id, snapshot: { ...snapshot(), requestId } }))
      : [],
  };
  const calls = [];
  const state = { error: null, conflictOnce: false, tables, calls };
  state.clientFactory = (_url, _key, options) => {
    const bearer = options.global?.headers.Authorization;
    const ownerId = bearer?.includes('bbb.bbb') ? ownerB : ownerA;
    calls.push({ client: options });
    return {
      from(table) {
        let action = 'select';
        let values;
        let fields;
        let singular = false;
        const filters = [];
        const query = {
          select(value) {
            fields = value;
            return query;
          },
          eq(key, value) {
            filters.push([key, value]);
            return query;
          },
          order() {
            return query;
          },
          maybeSingle() {
            singular = true;
            return query;
          },
          single() {
            singular = true;
            return query;
          },
          insert(value) {
            action = 'insert';
            values = value;
            return query;
          },
          update(value) {
            action = 'update';
            values = value;
            return query;
          },
          then(resolve, reject) {
            try {
              calls.push({ table, action, fields, values, filters });
              if (state.error)
                return Promise.resolve({ data: null, error: state.error }).then(resolve, reject);
              let rows =
                table === 'published_tasks'
                  ? tables.tasks
                      .filter((row) => row.status === 'published')
                      .map((row) => ({ ...row, description: row.need ?? row.context ?? row.title }))
                  : tables[table];
              rows = rows.filter((row) => filters.every(([key, value]) => row[key] === value));
              if (action === 'insert') {
                if (
                  tables[table].some(
                    (row) =>
                      row.owner_id === ownerId &&
                      (table === 'task_workspaces' || row.request_id === values.request_id),
                  )
                )
                  return Promise.resolve({ data: null, error: { code: '23505' } }).then(
                    resolve,
                    reject,
                  );
                const now = '2026-09-23T00:00:00.000Z';
                const row = {
                  ...values,
                  owner_id: ownerId,
                  id: tables.tasks.length + 1,
                  created_at: now,
                  updated_at: now,
                  published_at: values.status === 'published' ? now : null,
                };
                tables[table].push(row);
                if (state.conflictOnce) {
                  state.conflictOnce = false;
                  return Promise.resolve({ data: null, error: { code: '23505' } }).then(
                    resolve,
                    reject,
                  );
                }
                rows = [row];
              } else if (action === 'update') {
                for (const row of rows) {
                  if (row.status === 'published' && values.status === 'draft') continue;
                  Object.assign(row, values);
                  if (row.status === 'published') row.published_at ||= '2026-09-23T00:00:00.000Z';
                }
              }
              const projected = rows.map((row) =>
                Object.fromEntries(fields.split(',').map((field) => [field, row[field]])),
              );
              return Promise.resolve({
                data: singular ? (projected[0] ?? null) : projected,
                error: null,
              }).then(resolve, reject);
            } catch (error) {
              return Promise.reject(error).then(resolve, reject);
            }
          },
        };
        return query;
      },
    };
  };
  state.repository = createSupabaseTaskRepository({ config, clientFactory: state.clientFactory });
  state.app = createApp({ authService, taskRepository: state.repository });
  return state;
}

test('unconfigured repository has no demo fallback and missing migrations are actionable', async () => {
  const empty = await request(createApp(), '/api/tasks', { token: null });
  assert.equal(empty.status, 503);
  assert.equal(empty.json.error.code, 'TASKS_NOT_CONFIGURED');
  const db = database();
  for (const code of ['PGRST205', '42P01']) {
    db.error = { code, message: 'private secret' };
    const response = await request(db.app, '/api/tasks');
    assert.equal(response.status, 503);
    assert.equal(response.json.error.code, 'TASKS_SCHEMA_MISSING');
    assert.equal(JSON.stringify(response.json).includes('private secret'), false);
  }
});

test('draft persists, publishing preserves ID, retries are idempotent and public catalogue excludes private fields', async () => {
  const db = database();
  const first = await request(db.app, '/api/tasks', { method: 'POST', body: draft() });
  assert.equal(first.status, 200);
  assert.equal(first.json.data.status, 'draft');
  assert.equal(first.json.data.score, null);
  assert.deepEqual((await request(db.app, '/api/tasks', { token: null })).json.data, []);
  assert.equal((await request(db.app, '/api/tasks/1')).status, 404);
  const publish = { ...draft(), status: 'published' };
  const second = await request(db.app, '/api/tasks', { method: 'POST', body: publish });
  assert.equal(second.json.data.id, first.json.data.id);
  assert.equal(second.json.data.requestId, requestId);
  const retried = await request(db.app, '/api/tasks', { method: 'POST', body: publish });
  assert.equal(retried.json.data.id, first.json.data.id);
  assert.equal(db.tables.tasks.length, 1);
  await request(db.app, '/api/tasks', {
    method: 'POST',
    body: { ...draft(), card: { ...draft().card, title: 'Stale draft' } },
  });
  assert.equal(db.tables.tasks[0].status, 'published');
  assert.equal(db.tables.tasks[0].title, 'Моя задача');
  const list = await request(db.app, '/api/tasks', { token: null });
  assert.equal(list.json.data.length, 1);
  const publicTask = list.json.data[0];
  for (const key of ['owner_id', 'requestId', 'originalDescription', 'request_id'])
    assert.equal(Object.hasOwn(publicTask, key), false);
  assert.equal(publicTask.card.businessContact, null);
  assert.equal(JSON.stringify(publicTask).includes('private@example.com'), false);
  assert.deepEqual((await request(db.app, '/api/tasks/1', { token: null })).json.data, publicTask);
  const own = await request(db.app, '/api/tasks/mine');
  assert.equal(own.json.data[0].card.businessContact, 'private@example.com');
  assert.equal(own.json.data[0].originalDescription, draft().description);
  const freshRepository = createSupabaseTaskRepository({ config, clientFactory: db.clientFactory });
  assert.equal((await freshRepository.list()).length, 1);
  const insert = db.calls.find((call) => call.action === 'insert');
  assert.equal(Object.hasOwn(insert.values, 'owner_id'), false);
  assert.equal(Object.hasOwn(insert.values, 'id'), false);
  const update = db.calls.find((call) => call.action === 'update');
  assert.equal(Object.hasOwn(update.values, 'request_id'), false);
  assert.ok(db.calls.filter((call) => call.client && !call.client.global).length >= 1);
});

test('concurrent unique-key inserts are recovered without duplicating tasks', async () => {
  const db = database();
  db.conflictOnce = true;
  const response = await request(db.app, '/api/tasks', { method: 'POST', body: draft() });
  assert.equal(response.status, 200);
  assert.equal(db.tables.tasks.length, 1);
});

test('verified ownership isolates private tasks and identical request IDs across accounts', async () => {
  const db = database();
  await request(db.app, '/api/tasks', { method: 'POST', body: draft() });
  assert.deepEqual(
    (await request(db.app, '/api/tasks/mine', { token: 'bbb.bbb.ccc' })).json.data,
    [],
  );
  const response = await request(db.app, '/api/tasks', {
    method: 'POST',
    body: draft(),
    token: 'bbb.bbb.ccc',
  });
  assert.equal(response.status, 200);
  assert.equal(db.tables.tasks.length, 2);
  assert.equal(db.tables.tasks[1].owner_id, ownerB);
  assert.ok(
    db.calls.some((call) =>
      call.filters?.some(([key, value]) => key === 'owner_id' && value === ownerB),
    ),
  );
});

test('writes and private reads reject anonymous and student users before accessing database', async () => {
  const db = database();
  for (const [token, status] of [
    [null, 401],
    ['sss.bbb.ccc', 403],
  ]) {
    for (const [url, method, body] of [
      ['/api/tasks', 'POST', draft()],
      ['/api/tasks/mine', 'GET'],
      ['/api/task-workspace', 'GET'],
      ['/api/task-workspace', 'PUT', snapshot()],
    ]) {
      assert.equal((await request(db.app, url, { token, method, body })).status, status);
    }
  }
  assert.equal(db.calls.length, 0);
});

test('writes reject spoofed ownership, unknown fields, invalid publication and bounded JSON without mutation', async () => {
  const db = database();
  for (const body of [
    { ...draft(), owner_id: ownerB },
    { ...draft(), id: 1 },
    { ...draft(), status: 'published', description: 'short' },
    { ...draft(), card: { ...draft().card, title: '' } },
  ]) {
    const response = await request(db.app, '/api/tasks', { method: 'POST', body });
    assert.equal(response.status, 400);
    assert.equal(response.json.error.code, 'INVALID_TASK');
  }
  for (const [body, type, status] of [
    ['{', 'application/json', 400],
    ['x'.repeat(128 * 1024 + 1), 'application/json', 413],
    ['{}', 'text/plain', 415],
  ]) {
    assert.equal(
      (await request(db.app, '/api/tasks', { method: 'POST', body, type })).status,
      status,
    );
  }
  const method = await request(db.app, '/api/tasks/mine', { method: 'POST', body: draft() });
  assert.equal(method.status, 405);
  assert.equal(method.headers.Allow, 'GET, HEAD');
  assert.equal(db.calls.length, 0);
});

test('workspace stores all questions and answers privately and updates the single own snapshot', async () => {
  const db = database({ seedWorkspace: false });
  assert.equal((await request(db.app, '/api/task-workspace')).json.data, null);
  const first = await request(db.app, '/api/task-workspace', { method: 'PUT', body: snapshot() });
  assert.equal(first.status, 200);
  assert.deepEqual(first.json.data, snapshot());
  assert.deepEqual((await request(db.app, '/api/task-workspace')).json.data, snapshot());
  assert.equal(
    (await request(db.app, '/api/task-workspace', { token: 'bbb.bbb.ccc' })).json.data,
    null,
  );
  const next = snapshot();
  next.analysis.answers.q1 = 'Уточнённый ответ';
  assert.equal(
    (await request(db.app, '/api/task-workspace', { method: 'PUT', body: next })).status,
    200,
  );
  assert.equal(db.tables.task_workspaces.length, 1);
  assert.equal(
    (await request(db.app, '/api/task-workspace')).json.data.analysis.answers.q1,
    'Уточнённый ответ',
  );
  const invalid = await request(db.app, '/api/task-workspace', {
    method: 'PUT',
    body: { ...snapshot(), auth: { token: 'secret' } },
  });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.json.error.code, 'INVALID_TASK_WORKSPACE');
  assert.equal(
    (
      await request(db.app, '/api/task-workspace', {
        method: 'PUT',
        body: 'x'.repeat(256 * 1024 + 1),
      })
    ).status,
    413,
  );
});

test('task saves archive questionnaire from verified owner database workspace, never from caller-supplied snapshots', async () => {
  const db = database();
  const saved = await request(db.app, '/api/tasks', {
    method: 'POST',
    body: { ...draft(), status: 'published' },
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.json.data.analysisSnapshot.analysis.answers.q1, 'Частный ответ');
  const next = snapshot();
  next.analysis.answers.q1 = 'Ответ для другой задачи';
  await request(db.app, '/api/task-workspace', { method: 'PUT', body: next });
  const mine = await request(db.app, '/api/tasks/mine');
  assert.equal(mine.json.data[0].analysisSnapshot.analysis.answers.q1, 'Частный ответ');
  const catalogue = await request(db.app, '/api/tasks');
  assert.equal(catalogue.json.data[0].analysisSnapshot, undefined);
  assert.equal(JSON.stringify(catalogue.json).includes('Частный ответ'), false);
  const body = { ...draft(), analysisSnapshot: next };
  assert.equal((await request(db.app, '/api/tasks', { method: 'POST', body })).status, 400);
});

test('task publication requires matching workspace request ID before mutating tasks', async () => {
  const db = database({ seedWorkspace: false });
  for (const workspace of [null, snapshot()]) {
    if (workspace) await request(db.app, '/api/task-workspace', { method: 'PUT', body: workspace });
    const result = await request(db.app, '/api/tasks', { method: 'POST', body: draft() });
    assert.equal(result.status, 409);
    assert.equal(result.json.error.code, 'WORKSPACE_OUT_OF_SYNC');
  }
  assert.equal(db.tables.tasks.length, 0);
});

test('AI calls require verified business identity before invoking the paid provider', async () => {
  let calls = 0;
  const app = createApp({
    authService,
    analysisService: {
      async run() {
        calls++;
        return {};
      },
    },
  });
  for (const [token, status] of [
    [null, 401],
    ['sss.bbb.ccc', 403],
  ]) {
    for (const operation of ['questions', 'generate', 'score']) {
      assert.equal(
        (
          await request(app, `/api/ai/task-analysis/${operation}`, {
            method: 'POST',
            body: {},
            token,
          })
        ).status,
        status,
      );
    }
  }
  assert.equal(calls, 0);
  assert.equal(
    (await request(app, '/api/ai/task-analysis/questions', { method: 'POST', body: {} })).status,
    200,
  );
  assert.equal(calls, 1);
});
