import assert from 'node:assert/strict';
import test from 'node:test';
import { demoTasks } from '@ai-sana/contracts/fixtures';
import { createInitialState } from '../src/app/initial-state.js';
import * as pages from '../src/pages/index.js';

function readyState() {
  const state = createInitialState();
  state.catalog = { items: structuredClone(demoTasks), status: 'ready', error: '' };
  return state;
}

test('all pages render on Node without browser globals or modifying their input', () => {
  const state = readyState();
  const before = structuredClone(state);
  for (const [name, page] of Object.entries(pages)) {
    const html = page(state, name === 'simple' ? 'profile' : false);
    assert.equal(typeof html, 'string', name);
    assert.ok(html.includes('AI Sana'), name);
  }
  assert.ok(pages.auth(state, true).includes('id="register-form"'));
  assert.ok(!pages.simple(state).includes('Data Wizards'));
  assert.deepEqual(state, before);
});

test('catalog and details expose loading and failures instead of stale task content', () => {
  const state = readyState();
  for (const status of ['idle', 'loading']) {
    state.catalog.status = status;
    for (const page of [pages.catalog, pages.detail]) {
      const html = page(state);
      assert.ok(html.includes('role="status"'));
      assert.ok(!html.includes(demoTasks[0].title));
    }
  }
  state.catalog.status = 'error';
  state.catalog.error = '<script>API failed</script>';
  for (const page of [pages.catalog, pages.detail]) {
    const html = page(state);
    assert.ok(html.includes('data-action="retry-catalog"'));
    assert.ok(html.includes('&lt;script&gt;API failed&lt;/script&gt;'));
    assert.ok(!html.includes('<script>'));
  }
});

test('each catalog link opens its own task details, and missing IDs have a not-found view', () => {
  const state = readyState();
  state.fields['Доступные данные'] = 'Private unsaved editor data';
  const catalog = pages.catalog(state);
  for (const task of state.catalog.items) {
    assert.ok(catalog.includes(`detail?id=${task.id}`));
    state.currentTaskId = task.id;
    const html = pages.detail(state);
    assert.ok(html.includes(`<h1>${task.title}</h1>`));
    assert.ok(html.includes(task.description));
    assert.ok(!html.includes(state.fields['Доступные данные']));
  }
  state.currentTaskId = 999;
  assert.ok(pages.detail(state).includes('Задача не найдена'));
});

test('external task text and user-entered fields are escaped at HTML boundaries', () => {
  const state = readyState();
  const hostile = '<img src=x onerror="alert(1)">';
  state.catalog.items = [
    { ...demoTasks[0], title: hostile, industry: hostile, description: hostile, tags: [hostile] },
  ];
  state.currentTaskId = 1;
  for (const page of [pages.catalog, pages.detail]) {
    const html = page(state);
    assert.ok(!html.includes(hostile));
    assert.ok(html.includes('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;'));
  }
  state.fields = { [hostile]: hostile };
  const editor = pages.editor(state);
  assert.ok(!editor.includes(hostile));
  assert.ok(editor.includes('data-edit="&lt;img'));
  state.description = '</textarea><script>alert(1)</script>';
  state.answers[0] = state.description;
  for (const page of [pages.create, pages.clarify]) {
    assert.ok(!page(state).includes('<script>alert(1)</script>'));
  }
});

test('editor offers real AI scoring instead of a fabricated readiness score', () => {
  const state = readyState();
  assert.ok(pages.editor(state).includes('AI-Scoring'));
  assert.ok(pages.editor(state).includes('data-action="score-task"'));
  assert.ok(!pages.editor(state).includes('0/15'));
  state.aiScoring = { status: 'loading' };
  assert.ok(pages.editor(state).includes('OpenAI оценивает качество карточки'));
  state.aiScoring = { status: 'error', error: '<script>error</script>' };
  assert.ok(pages.editor(state).includes('&lt;script&gt;error&lt;/script&gt;'));
  state.published = true;
  state.currentTaskId = 5;
  state.catalog.status = 'error';
  assert.ok(pages.detail(state).includes('Не удалось загрузить задачи'));
  assert.ok(!pages.detail(state).includes('Анализ и прогнозирование оттока клиентов'));
});

test('submitted proposal keeps its original task when another task is viewed', () => {
  const state = readyState();
  state.proposals = {
    status: 'ready',
    error: '',
    items: [
      {
        id: '11111111-1111-4111-8111-111111111111',
        taskId: 4,
        taskTitle: '<script>Original task</script>',
        teamName: 'Команда',
        idea: 'Идея',
        plan: 'План',
        deadline: 'Две недели',
        prototypeUrl: null,
        createdAt: '2026-09-23T00:00:00Z',
        status: 'pending',
        decidedAt: null,
      },
    ],
  };
  state.currentTaskId = 1;
  const before = pages.myProposals(state);
  assert.ok(before.includes('detail?id=4'));
  assert.ok(before.includes('&lt;script&gt;Original task&lt;/script&gt;'));
  assert.ok(!before.includes('<script>'));
  state.currentTaskId = 2;
  assert.equal(pages.myProposals(state), before);
});
