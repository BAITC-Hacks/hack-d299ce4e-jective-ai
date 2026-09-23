import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import test from 'node:test';
import { createApp } from '../src/app.js';
import { createSupabaseProposalRepository } from '../src/modules/proposals/repository.js';
import { HttpError } from '../src/shared/http-error.js';

const studentA = '550e8400-e29b-41d4-a716-446655440000';
const studentB = '550e8400-e29b-41d4-a716-446655440001';
const ownerA = '550e8400-e29b-41d4-a716-446655440002';
const ownerB = '550e8400-e29b-41d4-a716-446655440003';
const identities = {
  'student.a.token': { id: studentA, role: 'student' },
  'student.b.token': { id: studentB, role: 'student' },
  'business.a.token': { id: ownerA, role: 'business' },
  'business.b.token': { id: ownerB, role: 'business' },
  'unknown.a.token': { id: ownerA, role: 'admin' },
};
const config = { url: 'https://example.supabase.co', publishableKey: 'sb_publishable_test' };
const input = () => ({
  taskId: 1,
  teamName: 'Команда студентов',
  idea: 'Частная идея',
  plan: 'Частный план',
  deadline: 'Две недели',
  prototypeUrl: 'https://example.com/prototype',
});
const authService = {
  async getCurrentUser(request) {
    const identity = identities[request.headers?.authorization?.replace('Bearer ', '')];
    if (!identity) throw new HttpError(401, 'UNAUTHORIZED', 'Войдите в аккаунт.');
    return { user: { id: identity.id }, profile: identity };
  },
};

async function request(
  app,
  {
    method = 'GET',
    body,
    token = 'student.a.token',
    type = 'application/json',
    url = '/api/proposals',
  } = {},
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

/** SQL-like transport: records explicit filters and applies the same per-user visibility as RLS. */
function database() {
  const tables = {
    tasks: [
      { id: 1, owner_id: ownerA, title: 'Первая задача', status: 'published' },
      { id: 2, owner_id: ownerB, title: 'Вторая задача', status: 'published' },
      { id: 3, owner_id: ownerA, title: 'Частный черновик', status: 'draft' },
    ],
    proposals: [],
  };
  const calls = [];
  const state = {
    tables,
    calls,
    error: null,
    conflictOnce: false,
    leakRows: false,
    beforeUpdate: null,
    updateClock: 0,
  };
  state.clientFactory = (_url, _key, options) => {
    const token = options.global?.headers.Authorization.replace('Bearer ', '');
    const actor = identities[token];
    calls.push({ options });
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
          in(key, value) {
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
              calls.push({ table, action, values, fields, filters });
              if (state.error)
                return Promise.resolve({ data: null, error: state.error }).then(resolve, reject);
              if (action === 'update' && state.beforeUpdate) {
                const callback = state.beforeUpdate;
                state.beforeUpdate = null;
                callback(tables, values);
              }
              let rows =
                table === 'published_tasks'
                  ? tables.tasks.filter((row) => row.status === 'published')
                  : tables[table];
              if (!state.leakRows) {
                rows = rows.filter((row) =>
                  filters.every(([key, value]) =>
                    Array.isArray(value) ? value.includes(row[key]) : row[key] === value,
                  ),
                );
                if (table === 'tasks') rows = rows.filter((row) => row.owner_id === actor.id);
                if (table === 'proposals')
                  rows = rows.filter(
                    (row) =>
                      row.student_id === actor.id ||
                      tables.tasks.some(
                        (task) => task.id === row.task_id && task.owner_id === actor.id,
                      ),
                  );
              }
              if (action === 'insert') {
                if (
                  tables.proposals.some(
                    (row) => row.task_id === values.task_id && row.student_id === actor.id,
                  )
                )
                  return Promise.resolve({ data: null, error: { code: '23505' } }).then(
                    resolve,
                    reject,
                  );
                const row = {
                  ...values,
                  student_id: actor.id,
                  id: `550e8400-e29b-41d4-a716-4466554400${String(tables.proposals.length + 10).padStart(2, '0')}`,
                  created_at: '2026-09-23T10:00:00.000Z',
                  status: 'pending',
                  decided_at: null,
                };
                tables.proposals.push(row);
                if (state.conflictOnce) {
                  state.conflictOnce = false;
                  return Promise.resolve({ data: null, error: { code: '23505' } }).then(
                    resolve,
                    reject,
                  );
                }
                rows = [row];
              } else if (action === 'update') {
                rows = rows.filter(
                  (row) =>
                    actor.role === 'business' &&
                    tables.tasks.some(
                      (task) => task.id === row.task_id && task.owner_id === actor.id,
                    ),
                );
                for (const row of rows) {
                  if (row.status !== values.status) {
                    Object.assign(row, values, {
                      decided_at: `2026-09-23T11:00:${String(++state.updateClock).padStart(2, '0')}.000Z`,
                    });
                  }
                }
              }
              const projected = rows.map((row) =>
                Object.fromEntries(fields.split(',').map((key) => [key, row[key]])),
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
  state.repository = createSupabaseProposalRepository({
    config,
    clientFactory: state.clientFactory,
  });
  state.app = createApp({ authService, proposalRepository: state.repository });
  return state;
}

test('student proposal roundtrips every form field through database to student and task owner only', async () => {
  const db = database();
  const saved = await request(db.app, { method: 'POST', body: input() });
  assert.equal(saved.status, 200);
  for (const [key, value] of Object.entries(input())) assert.deepEqual(saved.json.data[key], value);
  assert.equal(saved.json.data.taskTitle, 'Первая задача');
  assert.equal(saved.json.data.status, 'pending');
  assert.equal(saved.json.data.decidedAt, null);
  assert.equal(saved.json.data.student_id, undefined);
  assert.equal(saved.json.data.owner_id, undefined);
  assert.deepEqual((await request(db.app)).json.data, [saved.json.data]);
  assert.deepEqual((await request(db.app, { token: 'business.a.token' })).json.data, [
    saved.json.data,
  ]);
  assert.deepEqual((await request(db.app, { token: 'student.b.token' })).json.data, []);
  assert.deepEqual((await request(db.app, { token: 'business.b.token' })).json.data, []);
  const fresh = createSupabaseProposalRepository({ config, clientFactory: db.clientFactory });
  assert.deepEqual(
    await fresh.list({ userId: studentA, role: 'student', accessToken: 'student.a.token' }),
    [saved.json.data],
  );
  assert.ok(
    db.calls.every(
      (call) => !call.options || call.options.global.headers.Authorization.startsWith('Bearer '),
    ),
  );
  const inserted = db.calls.find((call) => call.action === 'insert');
  for (const field of ['id', 'student_id', 'created_at', 'owner_id', 'status', 'decided_at'])
    assert.equal(Object.hasOwn(inserted.values, field), false);
  assert.ok(
    db.calls.some(
      (call) =>
        call.table === 'proposals' &&
        call.filters.some(
          ([key, value]) => key === 'task_id' && Array.isArray(value) && value[0] === 1,
        ),
    ),
  );
  assert.ok(
    db.calls.some(
      (call) =>
        call.table === 'proposals' &&
        call.filters.some(([key, value]) => key === 'student_id' && value === studentA),
    ),
  );
});

test('retry is idempotent, concurrent duplicate is recovered, changed second proposal is never overwritten', async () => {
  const db = database();
  db.conflictOnce = true;
  const first = await request(db.app, { method: 'POST', body: input() });
  assert.equal(first.status, 200);
  const second = await request(db.app, { method: 'POST', body: input() });
  assert.deepEqual(second.json.data, first.json.data);
  const changed = await request(db.app, {
    method: 'POST',
    body: { ...input(), idea: 'Новая идея' },
  });
  assert.equal(changed.status, 409);
  assert.equal(changed.json.error.code, 'PROPOSAL_EXISTS');
  assert.equal(db.tables.proposals.length, 1);
  assert.equal(db.tables.proposals[0].idea, input().idea);
  assert.equal(
    (await request(db.app, { method: 'POST', token: 'student.b.token', body: input() })).status,
    200,
  );
  assert.equal(db.tables.proposals.length, 2);
  assert.equal((await request(db.app, { token: 'business.a.token' })).json.data.length, 2);
});

test('anonymous, unverified and wrong-role writes fail before touching private repository', async () => {
  const db = database();
  for (const token of [null, 'invalid.token.value']) {
    for (const method of ['GET', 'HEAD', 'POST'])
      assert.equal((await request(db.app, { token, method, body: input() })).status, 401);
  }
  for (const token of ['business.a.token', 'unknown.a.token'])
    assert.equal((await request(db.app, { token, method: 'POST', body: input() })).status, 403);
  assert.equal((await request(db.app, { token: 'unknown.a.token' })).status, 403);
  assert.equal(db.calls.length, 0);
});

test('unsupported methods cannot mutate, HEAD respects auth and has no private body', async () => {
  const db = database();
  for (const method of ['DELETE', 'PATCH', 'PUT']) {
    const response = await request(db.app, { method, body: input() });
    assert.equal(response.status, 405);
    assert.equal(response.headers.Allow, 'GET, HEAD, POST');
  }
  assert.equal(db.calls.length, 0);
  await request(db.app, { method: 'POST', body: input() });
  const head = await request(db.app, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(head.body, undefined);
  assert.equal(head.headers['Cache-Control'], 'no-store');
});

test('strict form validation and bounded JSON reject forged ownership and unsafe prototype links', async () => {
  const db = database();
  for (const body of [
    { ...input(), student_id: studentB },
    { ...input(), createdAt: '2026-09-23' },
    { ...input(), status: 'accepted' },
    { ...input(), decidedAt: '2026-09-23T10:00:00Z' },
    { ...input(), taskId: '1' },
    { ...input(), teamName: '' },
    { ...input(), plan: 'x'.repeat(10_001) },
    { ...input(), prototypeUrl: 'javascript:alert(1)' },
    { ...input(), prototypeUrl: 'https://user:secret@example.com' },
  ]) {
    const response = await request(db.app, { method: 'POST', body });
    assert.equal(response.status, 400);
    assert.equal(response.json.error.code, 'INVALID_PROPOSAL');
  }
  assert.equal((await request(db.app, { method: 'POST', body: '{broken' })).status, 400);
  assert.equal(
    (await request(db.app, { method: 'POST', body: input(), type: 'text/plain' })).status,
    415,
  );
  assert.equal(
    (await request(db.app, { method: 'POST', body: 'x'.repeat(128 * 1024 + 1) })).status,
    413,
  );
  assert.equal(db.calls.length, 0);
});

test('draft and absent tasks cannot receive proposals', async () => {
  const db = database();
  for (const taskId of [3, 999]) {
    const response = await request(db.app, { method: 'POST', body: { ...input(), taskId } });
    assert.equal(response.status, 404);
    assert.equal(response.json.error.code, 'TASK_NOT_FOUND');
  }
  assert.equal(db.tables.proposals.length, 0);
});

test('database failures are actionable and never reveal query data or raw errors', async () => {
  const unconfigured = await request(createApp({ authService }));
  assert.equal(unconfigured.status, 503);
  assert.equal(unconfigured.json.error.code, 'PROPOSALS_NOT_CONFIGURED');
  const db = database();
  for (const [code, status, expected] of [
    ['PGRST205', 503, 'PROPOSALS_SCHEMA_MISSING'],
    ['42703', 503, 'PROPOSALS_SCHEMA_MISSING'],
    ['42501', 403, 'PROPOSALS_FORBIDDEN'],
    ['23514', 400, 'INVALID_PROPOSAL'],
    ['23503', 404, 'TASK_NOT_FOUND'],
    ['offline', 503, 'PROPOSALS_UNAVAILABLE'],
  ]) {
    db.error = { code, message: 'private request data and Bearer token' };
    const response = await request(db.app);
    assert.equal(response.status, status);
    assert.equal(response.json.error.code, expected);
    if (expected === 'PROPOSALS_SCHEMA_MISSING')
      assert.match(response.json.error.message, /20260923000500_proposal_decisions\.sql/);
    assert.equal(JSON.stringify(response.json).includes('private request data'), false);
  }
});

test('adapter rejects accidental cross-account rows even if a database adapter ignores filters', async () => {
  const db = database();
  await request(db.app, { method: 'POST', body: input() });
  db.leakRows = true;
  for (const token of ['student.b.token', 'business.b.token']) {
    const response = await request(db.app, { token });
    assert.equal(response.status, 503);
    assert.equal(JSON.stringify(response.json).includes(input().idea), false);
  }
});

test('direct database rows with Unicode text and malformed optional URLs cannot break the business inbox', async () => {
  const db = database();
  await request(db.app, { method: 'POST', body: input() });
  db.tables.proposals[0].team_name = '😀'.repeat(200);
  db.tables.proposals[0].prototype_url = 'http://:invalid';
  const result = await request(db.app, { token: 'business.a.token' });
  assert.equal(result.status, 200);
  assert.equal(result.json.data[0].teamName, '😀'.repeat(200));
  assert.equal(result.json.data[0].prototypeUrl, null);
  assert.equal(result.json.data[0].idea, input().idea);
});

async function decide(db, id, body, options = {}) {
  return request(db.app, {
    token: 'business.a.token',
    method: 'PATCH',
    url: `/api/proposals/${id}/decision`,
    body,
    ...options,
  });
}

async function submitted(db, options = {}) {
  const response = await request(db.app, { method: 'POST', body: input(), ...options });
  assert.equal(response.status, 200);
  return response.json.data;
}

test('own business decision persists server timestamp and reaches student, without modifying other proposals or task', async () => {
  const db = database();
  const first = await submitted(db);
  const second = await submitted(db, { token: 'student.b.token' });
  const before = structuredClone(db.tables);
  const accepted = await decide(db, first.id, { status: 'accepted', expectedStatus: 'pending' });
  assert.equal(accepted.status, 200);
  assert.equal(accepted.json.data.status, 'accepted');
  assert.equal(accepted.json.data.decidedAt, '2026-09-23T11:00:01.000Z');
  assert.deepEqual((await request(db.app)).json.data, [accepted.json.data]);
  assert.equal(
    (await request(db.app, { token: 'student.b.token' })).json.data[0].status,
    'pending',
  );
  assert.equal(second.status, 'pending');
  assert.deepEqual(db.tables.tasks, before.tasks);
  assert.deepEqual(db.tables.proposals[1], before.proposals[1]);
  const originalFields = (row) =>
    Object.fromEntries(
      Object.entries(row).filter(([key]) => !['status', 'decided_at'].includes(key)),
    );
  assert.deepEqual(originalFields(db.tables.proposals[0]), originalFields(before.proposals[0]));
  const update = db.calls.find((call) => call.action === 'update');
  assert.deepEqual(update.values, { status: 'accepted' });
  assert.deepEqual(update.filters, [
    ['id', first.id],
    ['task_id', first.taskId],
    ['status', 'pending'],
  ]);
});

test('decision retries are idempotent and changing an earlier decision requires its current status', async () => {
  const db = database();
  const proposal = await submitted(db);
  const first = await decide(db, proposal.id, { status: 'accepted', expectedStatus: 'pending' });
  const retry = await decide(db, proposal.id, { status: 'accepted', expectedStatus: 'pending' });
  assert.deepEqual(retry.json.data, first.json.data);
  assert.equal(db.calls.filter((call) => call.action === 'update').length, 1);
  const studentRetry = await request(db.app, { method: 'POST', body: input() });
  assert.deepEqual(studentRetry.json.data, first.json.data);
  assert.equal(db.tables.proposals[0].status, 'accepted');
  const stale = await decide(db, proposal.id, { status: 'rejected', expectedStatus: 'pending' });
  assert.equal(stale.status, 409);
  assert.equal(stale.json.error.code, 'PROPOSAL_DECISION_CONFLICT');
  assert.equal(db.calls.filter((call) => call.action === 'update').length, 1);
  const rejected = await decide(db, proposal.id, {
    status: 'rejected',
    expectedStatus: 'accepted',
  });
  assert.equal(rejected.status, 200);
  assert.equal(rejected.json.data.status, 'rejected');
  assert.notEqual(rejected.json.data.decidedAt, first.json.data.decidedAt);
  const acceptedAgain = await decide(db, proposal.id, {
    status: 'accepted',
    expectedStatus: 'rejected',
  });
  assert.equal(acceptedAgain.status, 200);
  assert.equal(acceptedAgain.json.data.status, 'accepted');
});

test('decision authentication and role checks precede ID/body validation or private reads', async () => {
  const db = database();
  for (const [token, expected] of [
    [null, 401],
    ['invalid.token.value', 401],
    ['student.a.token', 403],
    ['unknown.a.token', 403],
  ]) {
    const response = await decide(db, 'invalid-id', '{invalid', { token });
    assert.equal(response.status, expected);
  }
  assert.equal(db.calls.length, 0);
  assert.equal((await decide(db, 'invalid-id', '{invalid')).json.error.code, 'INVALID_PROPOSAL_ID');
  assert.equal(db.calls.length, 0);
});

test('missing and foreign proposals are indistinguishable and cannot be updated', async () => {
  const db = database();
  const proposal = await submitted(db);
  const body = { status: 'accepted', expectedStatus: 'pending' };
  const foreign = await decide(db, proposal.id, body, { token: 'business.b.token' });
  const missing = await decide(db, '550e8400-e29b-41d4-a716-446655449999', body);
  assert.equal(foreign.status, 404);
  assert.deepEqual(foreign.json, missing.json);
  assert.equal(foreign.json.error.code, 'PROPOSAL_NOT_FOUND');
  db.leakRows = true;
  assert.equal((await decide(db, proposal.id, body, { token: 'business.b.token' })).status, 404);
  assert.equal(db.calls.filter((call) => call.action === 'update').length, 0);
  assert.equal(db.tables.proposals[0].status, 'pending');
});

test('decision requests reject forged contents/timestamps, pending reset, malformed IDs and oversized bodies', async () => {
  const db = database();
  const id = '550e8400-e29b-41d4-a716-446655440010';
  const valid = { status: 'accepted', expectedStatus: 'pending' };
  for (const body of [
    { ...valid, student_id: studentB },
    { ...valid, decidedAt: '2026-09-23T10:00:00Z' },
    { ...valid, idea: 'overwrite' },
    { ...valid, taskId: 2 },
    { ...valid, status: 'pending' },
    { status: 'accepted' },
    { ...valid, expectedStatus: 'invented' },
    null,
    [],
  ]) {
    const result = await decide(db, id, body);
    assert.equal(result.status, 400);
    assert.equal(result.json.error.code, 'INVALID_PROPOSAL_DECISION');
  }
  for (const invalidId of ['1', '%61', 'x'.repeat(500)])
    assert.equal((await decide(db, invalidId, valid)).json.error.code, 'INVALID_PROPOSAL_ID');
  assert.equal((await decide(db, id, '{broken')).json.error.code, 'INVALID_JSON');
  assert.equal((await decide(db, id, valid, { type: 'text/plain' })).status, 415);
  assert.equal((await decide(db, id, 'x'.repeat(4097))).status, 413);
  assert.equal(db.calls.length, 0);
});

test('decision endpoint only allows PATCH and uppercase UUIDs are normalized', async () => {
  const db = database();
  const proposal = await submitted(db);
  const before = db.calls.length;
  for (const method of ['GET', 'HEAD', 'POST', 'PUT', 'DELETE']) {
    const response = await decide(
      db,
      proposal.id,
      { status: 'accepted', expectedStatus: 'pending' },
      { method },
    );
    assert.equal(response.status, 405);
    assert.equal(response.headers.Allow, 'PATCH');
  }
  assert.equal(db.calls.length, before);
  const result = await decide(db, proposal.id.toUpperCase(), {
    status: 'accepted',
    expectedStatus: 'pending',
  });
  assert.equal(result.status, 200);
  assert.equal(result.json.data.id, proposal.id);
});

test('atomic decision loses a concurrent conflicting race without overwriting newer state', async () => {
  const db = database();
  const proposal = await submitted(db);
  db.beforeUpdate = (tables) =>
    Object.assign(tables.proposals[0], {
      status: 'rejected',
      decided_at: '2026-09-23T12:00:00.000Z',
    });
  const response = await decide(db, proposal.id, { status: 'accepted', expectedStatus: 'pending' });
  assert.equal(response.status, 409);
  assert.equal(response.json.error.code, 'PROPOSAL_DECISION_CONFLICT');
  assert.equal(db.tables.proposals[0].status, 'rejected');
  assert.equal(db.tables.proposals[0].decided_at, '2026-09-23T12:00:00.000Z');
  assert.equal(db.updateClock, 0);
});

test('atomic same-decision race returns persisted outcome and deletion race returns private 404', async () => {
  const db = database();
  const proposal = await submitted(db);
  db.beforeUpdate = (tables) =>
    Object.assign(tables.proposals[0], {
      status: 'accepted',
      decided_at: '2026-09-23T12:00:00.000Z',
    });
  const response = await decide(db, proposal.id, { status: 'accepted', expectedStatus: 'pending' });
  assert.equal(response.status, 200);
  assert.equal(response.json.data.decidedAt, '2026-09-23T12:00:00.000Z');
  assert.equal(db.updateClock, 0);
  db.beforeUpdate = (tables) => tables.proposals.splice(0, 1);
  assert.equal(
    (await decide(db, proposal.id, { status: 'rejected', expectedStatus: 'accepted' })).status,
    404,
  );
});

test('decision missing-schema errors point to the new migration and never expose database diagnostics', async () => {
  const db = database();
  const proposal = await submitted(db);
  db.error = { code: '42703', message: 'Private payload and auth token' };
  const response = await decide(db, proposal.id, { status: 'accepted', expectedStatus: 'pending' });
  assert.equal(response.status, 503);
  assert.equal(response.json.error.code, 'PROPOSALS_SCHEMA_MISSING');
  assert.match(response.json.error.message, /20260923000500_proposal_decisions\.sql/);
  assert.equal(JSON.stringify(response.json).includes('Private payload'), false);
  assert.equal(db.tables.proposals[0].status, 'pending');
});
