import assert from 'node:assert/strict';
import test from 'node:test';
import { demoTasks } from '@ai-sana/contracts/fixtures';
import { createApp } from '../src/app.js';
import { readServerConfig } from '../src/config.js';

async function request(app, url, method = 'GET') {
  const response = {
    writeHead(status, headers) {
      this.status = status;
      this.headers = headers;
    },
    end(body) {
      this.body = body;
    },
  };
  await app({ url, method }, response);
  return { ...response, json: response.body ? JSON.parse(response.body) : null };
}

test('health, catalogue and task detail share the public response envelope', async () => {
  const app = createApp();
  assert.deepEqual((await request(app, '/api/health')).json, { data: { status: 'ok' } });
  const catalogue = await request(app, '/api/tasks?source=test');
  assert.equal(catalogue.status, 200);
  assert.deepEqual(catalogue.json, { data: demoTasks });
  assert.deepEqual((await request(app, '/api/tasks/2')).json, { data: demoTasks[1] });
});

test('HEAD has GET headers with no body, including not-found responses', async () => {
  const app = createApp();
  for (const url of ['/api/health', '/api/tasks', '/api/tasks/2', '/missing']) {
    const get = await request(app, url);
    const head = await request(app, url, 'HEAD');
    assert.equal(head.status, get.status);
    assert.deepEqual(head.headers, get.headers);
    assert.equal(head.body, undefined);
  }
});

test('invalid IDs, missing tasks, unknown routes and unsupported writes have explicit errors', async () => {
  const app = createApp();
  for (const [url, status, code] of [
    ['/api/tasks/0', 400, 'INVALID_TASK_ID'],
    ['/api/tasks/abc', 400, 'INVALID_TASK_ID'],
    ['/api/tasks/999', 404, 'TASK_NOT_FOUND'],
    ['/api/unknown', 404, 'NOT_FOUND'],
  ]) {
    const response = await request(app, url);
    assert.equal(response.status, status);
    assert.equal(response.json.error.code, code);
  }
  const response = await request(app, '/api/tasks', 'POST');
  assert.equal(response.status, 405);
  assert.equal(response.headers.Allow, 'GET, HEAD');
  assert.equal(response.json.error.code, 'METHOD_NOT_ALLOWED');
});

test('an injected database adapter receives numeric IDs and cannot leak private fields', async () => {
  let receivedId;
  const app = createApp({
    taskRepository: {
      async list() {
        return [{ ...demoTasks[0], internalNote: 'private' }];
      },
      async findById(id) {
        receivedId = id;
        return { ...demoTasks[0], internalNote: 'private' };
      },
    },
  });
  assert.deepEqual((await request(app, '/api/tasks')).json, { data: [demoTasks[0]] });
  assert.deepEqual((await request(app, '/api/tasks/1')).json, { data: demoTasks[0] });
  assert.equal(receivedId, 1);
});

test('repository failures and invalid database rows return safe 500 responses', async () => {
  for (const list of [
    async () => {
      throw new Error('secret database connection');
    },
    async () => [{}],
  ]) {
    const errors = [];
    const app = createApp({
      taskRepository: {
        list,
        async findById() {
          return null;
        },
      },
      logger: {
        error(...args) {
          errors.push(args);
        },
      },
    });
    const response = await request(app, '/api/tasks');
    assert.equal(response.status, 500);
    assert.deepEqual(response.json, {
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error.' },
    });
    assert.equal(errors.length, 1);
  }
});

test('server configuration defaults to loopback and rejects invalid host/port values', () => {
  assert.deepEqual(readServerConfig({}), { host: '127.0.0.1', port: 3001 });
  assert.deepEqual(readServerConfig({ HOST: '::1', PORT: '4001' }), { host: '::1', port: 4001 });
  for (const PORT of ['', '0', '-1', '65536', '3.5', '3001oops']) {
    assert.throws(() => readServerConfig({ PORT }), /PORT/);
  }
  for (const HOST of ['', 'http://localhost', 'bad host', '..']) {
    assert.throws(() => readServerConfig({ HOST }), /HOST/);
  }
});
