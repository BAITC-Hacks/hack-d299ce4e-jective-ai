import assert from 'node:assert/strict';
import test from 'node:test';
import { demoTasks } from '@ai-sana/contracts/fixtures';
import { createTasksRepository } from '../src/features/tasks/repository.js';

test('mock repository returns independent public task objects without contacting the API', async () => {
  const repository = createTasksRepository(
    { dataSource: 'mock' },
    {
      get() {
        throw new Error('Mock mode must not make HTTP requests.');
      },
    },
  );
  const first = await repository.list();
  first[0].title = 'Changed';
  first[0].tags.push('Changed');
  assert.deepEqual(await repository.list(), demoTasks);
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

test('API failures propagate and unknown data sources are rejected', async () => {
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
  assert.throws(() => createTasksRepository({ dataSource: 'unexpected' }), /Unknown/);
});
