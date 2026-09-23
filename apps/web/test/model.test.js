import assert from 'node:assert/strict';
import test from 'node:test';
import { demoTasks } from '@ai-sana/contracts/fixtures';
import { createInitialState } from '../src/app/initial-state.js';
import { createStore } from '../src/app/store.js';
import { getTask, level, selectTasks } from '../src/features/tasks/model.js';

function taskState() {
  const state = createInitialState();
  state.catalog.items = structuredClone(demoTasks).reverse();
  return state;
}

test('initial state and stores do not share mutable nested data', () => {
  const original = createInitialState();
  const store = createStore(original);
  store.update((state) => ({ ...state, filters: { ...state.filters, search: 'retail' } }));
  store.getState().answers[0] = 'Local answer';
  assert.equal(original.filters.search, '');
  assert.equal(original.answers[0], undefined);
  assert.equal(createInitialState().answers[0], undefined);
});

test('task selection combines search and filters without mutating the store', () => {
  const state = taskState();
  state.filters = {
    search: '  КЛИЕНТОВ ',
    industry: 'FinTech',
    direction: 'Analytics',
    level: 'Готовая',
    sort: 'rating',
  };
  const before = structuredClone(state);
  assert.deepEqual(
    selectTasks(state).map((task) => task.id),
    [2],
  );
  assert.deepEqual(state, before);
  state.filters.search = 'operations';
  state.filters.industry = '';
  state.filters.direction = '';
  state.filters.level = '';
  assert.deepEqual(
    selectTasks(state).map((task) => task.id),
    [4],
    'search includes tags',
  );
});

test('only persisted catalog rows participate in filtering, sorting and detail selection', () => {
  const state = taskState();
  state.published = true;
  state.rating = 91;
  assert.equal(getTask(state, 5), undefined, 'a client-side published flag cannot invent a task');
  state.catalog.items.push({ ...demoTasks[1], id: 5, title: 'Persisted task', score: 91 });
  const before = structuredClone(state);
  assert.deepEqual(
    selectTasks(state).map((task) => task.id),
    [1, 5, 2, 3, 4],
  );
  assert.deepEqual(state, before);
  state.filters.sort = 'new';
  assert.deepEqual(
    selectTasks(state).map((task) => task.id),
    [5, 4, 3, 2, 1],
  );
  state.filters.industry = 'Retail';
  assert.deepEqual(
    selectTasks(state).map((task) => task.id),
    [1],
  );
  state.filters.industry = 'FinTech';
  state.filters.level = 'Приоритетная';
  assert.deepEqual(
    selectTasks(state).map((task) => task.id),
    [5],
  );
  assert.equal(getTask(state, 5).score, 91);
  assert.equal(getTask(state, 1).title, demoTasks[0].title);
  assert.equal(getTask(state, 999), undefined);
  assert.equal(level(91)[0], 'Приоритетная');
  assert.equal(level(34)[0], 'Черновик');
  assert.equal(level(null)[0], 'Нет оценки');
});
