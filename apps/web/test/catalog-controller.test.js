import assert from 'node:assert/strict';
import test from 'node:test';
import { demoTasks } from '@ai-sana/contracts/fixtures';
import { createInitialState } from '../src/app/initial-state.js';
import { createStore } from '../src/app/store.js';
import { createCatalogController } from '../src/features/tasks/catalog-controller.js';

test('a disposed catalog controller ignores late requests and cannot render the old application', async () => {
  const store = createStore(createInitialState());
  let resolveRequest;
  let renders = 0;
  const controller = createCatalogController({
    store,
    repository: {
      list: () =>
        new Promise((resolve) => {
          resolveRequest = resolve;
        }),
    },
    render: () => {
      renders += 1;
    },
  });
  const pending = controller.load();
  await Promise.resolve();
  controller.dispose();
  resolveRequest(structuredClone(demoTasks));
  await pending;
  await controller.load();
  assert.equal(renders, 1);
  assert.deepEqual(store.getState().catalog.items, []);
});

test('catalog controller coalesces concurrent loads and exposes loading then ready', async () => {
  const store = createStore(createInitialState());
  const statuses = [];
  let resolveRequest;
  let calls = 0;
  const response = new Promise((resolve) => {
    resolveRequest = resolve;
  });
  const controller = createCatalogController({
    store,
    repository: {
      list() {
        calls += 1;
        return response;
      },
    },
    render() {
      statuses.push(store.getState().catalog.status);
    },
  });
  const first = controller.load();
  const second = controller.load();
  assert.equal(first, second);
  assert.equal(store.getState().catalog.status, 'loading');
  await Promise.resolve();
  assert.equal(calls, 1);
  resolveRequest(structuredClone(demoTasks));
  await first;
  assert.deepEqual(statuses, ['loading', 'ready']);
  assert.deepEqual(store.getState().catalog.items, demoTasks);
});

test('catalog failure does not silently populate demo data and can be retried', async () => {
  const store = createStore(createInitialState());
  let calls = 0;
  const controller = createCatalogController({
    store,
    repository: {
      async list() {
        calls += 1;
        if (calls === 1) throw new Error('API offline');
        return [structuredClone(demoTasks[0])];
      },
    },
    render() {},
  });
  await controller.load();
  assert.equal(store.getState().catalog.status, 'error');
  assert.equal(store.getState().catalog.error, 'API offline');
  assert.deepEqual(store.getState().catalog.items, []);
  await controller.load();
  assert.equal(calls, 2);
  assert.equal(store.getState().catalog.status, 'ready');
  assert.equal(store.getState().catalog.error, '');
  assert.equal(store.getState().catalog.items.length, 1);
});
