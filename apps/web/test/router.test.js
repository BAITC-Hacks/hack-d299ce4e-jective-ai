import assert from 'node:assert/strict';
import test from 'node:test';
import { demoTasks } from '@ai-sana/contracts/fixtures';
import { createInitialState } from '../src/app/initial-state.js';
import { createRouter, parseRoute } from '../src/app/router.js';
import { createStore } from '../src/app/store.js';

test('hash routes preserve task IDs and the default entry points', () => {
  assert.deepEqual(parseRoute(''), { name: 'home', taskId: 2 });
  assert.deepEqual(parseRoute('#/detail'), { name: 'detail', taskId: 2 });
  assert.deepEqual(parseRoute('#/detail?id=3'), { name: 'detail', taskId: 3 });
});

test('router renders the selected task, falls back for unknown routes and cleans up listeners', (t) => {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  t.after(() => {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  });

  const events = new EventTarget();
  let scrolls = 0;
  let closedModals = 0;
  globalThis.window = {
    location: { hash: '#/detail?id=1' },
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    scrollTo() {
      scrolls += 1;
    },
  };
  globalThis.document = { title: '' };
  const initialState = createInitialState();
  initialState.savedTaskIds = [1];
  initialState.catalog = { status: 'ready', items: structuredClone(demoTasks), error: '' };
  const store = createStore(initialState);
  const root = { innerHTML: '' };
  const router = createRouter({
    root,
    store,
    feedback: {
      closeModal() {
        closedModals += 1;
      },
    },
    motion: {
      init(element) {
        assert.equal(element, root);
      },
    },
  });
  router.start();
  assert.equal(store.getState().currentTaskId, 1);
  assert.equal(store.getState().saved, true);
  assert.ok(root.innerHTML.includes(`<h1>${demoTasks[0].title}</h1>`));
  router.navigate('detail?id=1');
  assert.equal(closedModals, 1, 'same-route navigation still closes an open modal');
  router.navigate('detail?id=3');
  events.dispatchEvent(new Event('hashchange'));
  assert.equal(store.getState().currentTaskId, 3);
  assert.equal(store.getState().saved, false, 'saving task 1 does not save task 3');
  assert.ok(root.innerHTML.includes(`<h1>${demoTasks[2].title}</h1>`));
  assert.ok(scrolls > 0);

  globalThis.window.location.hash = '#/__proto__';
  events.dispatchEvent(new Event('hashchange'));
  assert.ok(root.innerHTML.includes('landing-v2'));
  assert.equal(globalThis.document.title, 'AI Sana — реальные задачи, реальный опыт');

  router.dispose();
  const previousHtml = root.innerHTML;
  globalThis.window.location.hash = '#/detail?id=4';
  events.dispatchEvent(new Event('hashchange'));
  assert.equal(root.innerHTML, previousHtml);
});
