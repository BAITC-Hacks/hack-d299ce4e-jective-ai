import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../src/app.js';

const userId = '550e8400-e29b-41d4-a716-446655440000';
const token = 'header.business.signature';
const config = { url: 'https://example.supabase.co', publishableKey: 'sb_publishable_test' };

async function request(app, url, method = 'GET') {
  const response = {
    writeHead(status, headers) {
      Object.assign(this, { status, headers });
    },
    end(body) {
      this.body = body;
    },
  };
  await app({ url, method, headers: { authorization: `Bearer ${token}` } }, response);
  return { ...response, json: response.body ? JSON.parse(response.body) : null };
}

test('application configuration reaches canonical task, proposal, workspace, attachment and auth adapters', async () => {
  const calls = [];
  const app = createApp({
    supabaseConfig: config,
    clientFactory(url, key, options) {
      assert.equal(url, config.url);
      assert.equal(key, config.publishableKey);
      assert.equal(options.auth.persistSession, false);
      assert.equal(options.auth.autoRefreshToken, false);
      return {
        auth: {
          async getUser(accessToken) {
            assert.equal(accessToken, token);
            assert.equal(options.global.headers.Authorization, `Bearer ${token}`);
            return { data: { user: { id: userId, email: 'business@example.com' } }, error: null };
          },
        },
        from(table) {
          let columns;
          const filters = [];
          const query = {
            select(value) {
              columns = value;
              return query;
            },
            eq(...filter) {
              filters.push(filter);
              return query;
            },
            in(...filter) {
              filters.push(filter);
              return query;
            },
            order() {
              return query;
            },
            maybeSingle() {
              return query;
            },
            then(resolve, reject) {
              calls.push({ table, filters, options });
              let data = [];
              if (table === 'profiles') {
                data = {
                  id: userId,
                  full_name: 'Business',
                  role: 'business',
                  created_at: '2026-09-23T10:00:00Z',
                  updated_at: '2026-09-23T10:00:00Z',
                };
              } else if (table === 'tasks' && columns === 'id,title,owner_id') {
                data = [{ id: 1, title: 'Task', owner_id: userId }];
              } else if (table === 'task_workspaces') data = null;
              return Promise.resolve({ data, error: null }).then(resolve, reject);
            },
          };
          return query;
        },
      };
    },
  });
  for (const [url, table] of [
    ['/api/auth/me', 'profiles'],
    ['/api/tasks', 'published_tasks'],
    ['/api/tasks/mine', 'tasks'],
    ['/api/task-workspace', 'task_workspaces'],
    ['/api/proposals', 'proposals'],
    [`/api/task-attachments?draft=${userId}`, 'task_attachments'],
  ]) {
    const before = calls.length;
    const response = await request(app, url);
    assert.equal(response.status, 200, `${url}: ${JSON.stringify(response.json)}`);
    assert.ok(
      calls.slice(before).some((call) => call.table === table),
      url,
    );
  }
  for (const call of calls) {
    if (call.table === 'published_tasks') assert.equal(call.options.global, undefined);
    else assert.equal(call.options.global.headers.Authorization, `Bearer ${token}`);
  }
});

test('method discovery advertises each route writable verbs without performing auth or mutations', async () => {
  const app = createApp({
    authService: {
      getCurrentUser() {
        assert.fail('Unexpected auth call');
      },
    },
  });
  for (const [url, method, allowed] of [
    ['/api/tasks', 'DELETE', 'GET, HEAD, POST'],
    ['/api/task-workspace', 'POST', 'GET, HEAD, PUT'],
    ['/api/proposals', 'PUT', 'GET, HEAD, POST'],
    [`/api/proposals/${userId}/decision`, 'GET', 'PATCH'],
    ['/api/ai/task-analysis/questions', 'GET', 'POST'],
    ['/api/ai/task-analysis/transcribe', 'GET', 'POST'],
    ['/api/task-attachments', 'PATCH', 'GET, POST'],
  ]) {
    const response = await request(app, url, method);
    assert.equal(response.status, 405, url);
    assert.equal(response.headers.Allow, allowed, url);
  }
});
