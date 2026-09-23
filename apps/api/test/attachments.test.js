import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { createApp } from '../src/app.js';
import { createAttachmentsService } from '../src/modules/attachments/service.js';
import { createDocumentExtractor, verifyFileBytes } from '../src/modules/attachments/extraction.js';
import { HttpError } from '../src/shared/http-error.js';

const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const draft = '33333333-3333-4333-8333-333333333333';
const id = '44444444-4444-4444-8444-444444444444';
const extraction = {
  summary: 'Описание учебного центра',
  facts: [{ text: 'Доступны данные посещаемости.', source: 'Раздел «Данные»' }],
  warnings: [],
};
const auth = {
  getCurrentUser: async () => ({ user: { id: owner }, profile: { role: 'business' } }),
};
async function request(app, path, { method = 'GET', body = '', type = 'application/json' } = {}) {
  const req = Object.assign(
    Readable.from([
      typeof body === 'object' && !Buffer.isBuffer(body) ? JSON.stringify(body) : body,
    ]),
    { method, url: path, headers: { 'content-type': type, authorization: 'Bearer user-token' } },
  );
  const res = new EventEmitter();
  res.writeHead = (status, headers) => Object.assign(res, { status, headers });
  res.end = (body) => {
    res.body = body;
    res.writableEnded = true;
  };
  await app(req, res);
  return { status: res.status, json: JSON.parse(res.body) };
}

function fakeStorage() {
  let rows = [];
  const objects = new Map();
  const client = {
    from() {
      let operation = 'select',
        changes,
        filters = [];
      const run = () => {
        if (operation === 'insert') {
          rows.push({ ...changes, extracted_context: null });
          return { data: rows.at(-1) };
        }
        const selected = rows.filter((r) => filters.every(([key, value]) => r[key] === value));
        if (operation === 'delete') {
          rows = rows.filter((r) => !selected.includes(r));
          return { data: null };
        }
        if (operation === 'update') selected.forEach((r) => Object.assign(r, changes));
        return { data: selected };
      };
      const query = {
        select() {
          return query;
        },
        eq(key, value) {
          filters.push([key, value]);
          return query;
        },
        order() {
          return query;
        },
        insert(value) {
          operation = 'insert';
          changes = value;
          return query;
        },
        update(value) {
          operation = 'update';
          changes = value;
          return query;
        },
        delete() {
          operation = 'delete';
          return query;
        },
        async single() {
          const result = run();
          return { data: Array.isArray(result.data) ? result.data[0] : result.data };
        },
        async maybeSingle() {
          return { data: run().data?.[0] || null };
        },
        then(resolve, reject) {
          return Promise.resolve(run()).then(resolve, reject);
        },
      };
      return query;
    },
    storage: {
      from() {
        return {
          async upload(path, bytes) {
            objects.set(path, bytes);
            return { data: {} };
          },
          async download(path) {
            return { data: new Blob([objects.get(path)]) };
          },
          async remove(paths) {
            paths.forEach((path) => objects.delete(path));
            return { data: {} };
          },
          async createSignedUrl(path, seconds) {
            assert.equal(seconds, 60);
            return { data: { signedUrl: `https://storage.test/${path}` } };
          },
        };
      },
    },
  };
  return { client, rows: () => rows, objects };
}

test('owned attachment lifecycle uploads, extracts, restores, resolves context and deletes original bytes', async () => {
  const fake = fakeStorage();
  const service = createAttachmentsService({
    config: { url: 'https://project.test', publishableKey: 'public' },
    clientFactory: (_url, _key, options) => {
      assert.equal(options.global.headers.Authorization, 'Bearer user-token');
      return fake.client;
    },
    extract: async () => extraction,
  });
  const req = { headers: { authorization: 'Bearer user-token' } };
  const file = await service.upload(
    req,
    owner,
    draft,
    'Данные.txt',
    Buffer.from('Данные посещаемости'),
  );
  assert.ok(file.storage_path.startsWith(`${owner}/${draft}/`));
  await assert.rejects(service.contexts(req, owner, [file.id]), { code: 'ATTACHMENT_NOT_READY' });
  await service.analyze(req, owner, file.id);
  assert.equal(
    (await service.list(req, owner, draft))[0].extracted_context.summary,
    extraction.summary,
  );
  assert.equal((await service.contexts(req, owner, [file.id]))[0].name, 'Данные.txt');
  await assert.rejects(service.contexts(req, other, [file.id]), { code: 'ATTACHMENT_NOT_FOUND' });
  await assert.rejects(service.contexts(req, owner, [file.id, file.id]), {
    code: 'INVALID_ATTACHMENTS',
  });
  assert.match((await service.download(req, owner, file.id)).url, /^https:/);
  await service.remove(req, owner, file.id);
  assert.equal(fake.rows().length, 0);
  assert.equal(fake.objects.size, 0);
});

test('storage upload failure rolls back metadata and empty/invalid files are rejected', async () => {
  const fake = fakeStorage();
  fake.client.storage.from = () => ({ upload: async () => ({ error: true }) });
  const service = createAttachmentsService({ config: {}, clientFactory: () => fake.client });
  await assert.rejects(
    service.upload({ headers: {} }, owner, draft, 'test.txt', Buffer.from('text')),
    { code: 'ATTACHMENTS_UNAVAILABLE' },
  );
  assert.equal(fake.rows().length, 0);
  await assert.rejects(
    service.upload({ headers: {} }, owner, draft, 'test.exe', Buffer.from('text')),
    { code: 'INVALID_FILE' },
  );
  assert.throws(() => verifyFileBytes(Buffer.from('not a PDF'), 'pdf'));
  assert.throws(() => verifyFileBytes(Buffer.from([255, 254]), 'txt'));
});

test('attachment routes require a verified business identity and reject unsupported operations', async () => {
  let called = false;
  const service = {
    list: async () => {
      called = true;
      return [];
    },
  };
  const anonymous = createApp({
    authService: {
      getCurrentUser: async () => {
        throw new HttpError(401, 'UNAUTHORIZED', 'Sign in');
      },
    },
    attachmentsService: service,
  });
  assert.equal((await request(anonymous, `/api/task-attachments?draft=${draft}`)).status, 401);
  const student = createApp({
    authService: {
      getCurrentUser: async () => ({ user: { id: other }, profile: { role: 'student' } }),
    },
    attachmentsService: service,
  });
  assert.equal((await request(student, `/api/task-attachments?draft=${draft}`)).status, 403);
  assert.equal(called, false);
  const app = createApp({ authService: auth, attachmentsService: service });
  assert.equal((await request(app, `/api/task-attachments?draft=${draft}`)).status, 200);
  assert.equal(
    (await request(app, `/api/task-attachments/${id}/download`, { method: 'POST' })).status,
    405,
  );
});

test('both analysis stages get owned contexts from storage, never client-forged document facts', async () => {
  const calls = [];
  const app = createApp({
    authService: auth,
    attachmentsService: {
      contexts: async (_req, userId, ids) => {
        assert.equal(userId, owner);
        assert.deepEqual(ids, [id]);
        return [{ id, name: 'facts.txt', ...extraction }];
      },
    },
    analysisService: {
      run: async (stage, data) => {
        calls.push({ stage, data });
        return {};
      },
    },
  });
  for (const stage of ['questions', 'generate']) {
    const response = await request(app, `/api/ai/task-analysis/${stage}`, {
      method: 'POST',
      body: {
        description: 'Описание задачи достаточно подробное.',
        attachmentIds: [id],
        attachedDocuments: [{ summary: 'Forged' }],
      },
    });
    assert.equal(response.status, 200);
    assert.equal(calls.at(-1).data.attachedDocuments[0].summary, extraction.summary);
  }
});

test('extractor uses untrusted input boundaries, actual file content and validates structured output', async () => {
  let sent;
  const extract = createDocumentExtractor({
    apiKey: 'test-secret',
    fetchImpl: async (_url, options) => {
      sent = JSON.parse(options.body);
      return Response.json({
        status: 'completed',
        output: [
          { type: 'message', content: [{ type: 'output_text', text: JSON.stringify(extraction) }] },
        ],
      });
    },
  });
  const value = await extract({ name: 'Данные.txt' }, Buffer.from('Доступна посещаемость.'));
  assert.deepEqual(value, extraction);
  assert.match(sent.input[0].content[0].text, /Доступна посещаемость/);
  assert.match(sent.instructions, /untrusted/);
  assert.equal(sent.store, false);
  const failing = createDocumentExtractor({
    apiKey: 'secret',
    fetchImpl: async () => Response.json({ status: 'completed', output: [] }),
  });
  await assert.rejects(failing({ name: 'test.txt' }, Buffer.from('abc')), {
    code: 'EXTRACTION_FAILED',
  });
});
