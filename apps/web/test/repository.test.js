import assert from 'node:assert/strict';
import test from 'node:test';
import { demoTasks } from '@ai-sana/contracts/fixtures';
import { createTasksRepository } from '../src/features/tasks/repository.js';

test('legacy mock settings cannot reintroduce fixtures when database is empty', async () => {
  let calls = 0;
  const repository = createTasksRepository(
    { dataSource: 'mock' },
    {
      async get(path) {
        calls += 1;
        assert.equal(path, '/tasks');
        return [];
      },
    },
  );
  assert.deepEqual(await repository.list(), []);
  assert.equal(calls, 1);
});

test('API repository fetches the endpoint and validates/sanitizes task DTOs', async () => {
  let path;
  const response = [{ ...demoTasks[0], privateToken: 'not-for-the-browser' }];
  const repository = createTasksRepository(
    { dataSource: 'api' },
    {
      async get(value) {
        path = value;
        return response;
      },
    },
  );
  const tasks = await repository.list();
  assert.equal(path, '/tasks');
  assert.deepEqual(tasks, [demoTasks[0]]);
  assert.ok(!Object.hasOwn(tasks[0], 'privateToken'));
  response[0].score = 'invalid';
  await assert.rejects(repository.list(), TypeError);
});

test('API failures propagate without a fallback', async () => {
  const failure = new Error('API offline');
  const repository = createTasksRepository(
    { dataSource: 'api' },
    {
      async get() {
        throw failure;
      },
    },
  );
  await assert.rejects(repository.list(), (error) => error === failure);
});

test('private task reads require a fresh access token for the expected account', async () => {
  let expected;
  let headers;
  const repository = createTasksRepository(
    {},
    {
      async get(path, options) {
        assert.equal(path, '/tasks/mine');
        headers = options.headers;
        return [];
      },
    },
    {
      getAccessToken: async (userId) => {
        expected = userId;
        return 'user-session-token';
      },
    },
  );
  assert.deepEqual(await repository.mine({ userId: 'owner' }), []);
  assert.equal(expected, 'owner');
  assert.equal(headers.Authorization, 'Bearer user-session-token');
  await assert.rejects(createTasksRepository({}).mine(), { code: 'UNAUTHORIZED' });
});
