import assert from 'node:assert/strict';
import test from 'node:test';
import { validateTask, validateTaskList } from '../src/index.js';
import { demoTasks } from '../src/fixtures.js';

test('public DTOs omit private fields and do not share mutable fixture arrays', () => {
  const task = validateTask({ ...demoTasks[0], privateToken: 'not public' });
  assert.equal('privateToken' in task, false);
  task.tags.push('New tag');
  assert.deepEqual(demoTasks[0].tags, ['Python', 'ML', 'Analytics']);
  assert.equal(validateTaskList(demoTasks).length, 4);
});

test('malformed network payloads are rejected at the contract boundary', () => {
  for (const input of [
    null,
    [],
    {},
    { ...demoTasks[0], id: '1' },
    { ...demoTasks[0], score: 101 },
    { ...demoTasks[0], reply: -1 },
    { ...demoTasks[0], tags: ['Python', null] },
    { ...demoTasks[0], title: ' ' },
  ]) {
    assert.throws(() => validateTask(input), TypeError);
  }
  assert.throws(() => validateTaskList({ data: demoTasks }), TypeError);
});
