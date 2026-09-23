import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialState } from '../src/app/initial-state.js';
import { dashboard, myTasks } from '../src/pages/business.js';
import { catalog, detail } from '../src/pages/catalog.js';
import { student, myProposals } from '../src/pages/student.js';
import { create, editor } from '../src/pages/task-editor.js';
import { taskRow } from '../src/components/task-row.js';
import { fieldLabels } from '../src/services/ai/types.js';

const sampleTask = (overrides = {}) => ({
  id: 47,
  title: 'Задача пользователя',
  industry: 'Образование',
  direction: 'Исследование',
  score: null,
  reply: 0,
  description: 'Описание реального проекта',
  tags: ['Исследование'],
  card: { context: 'Контекст из базы', businessContact: 'private@example.com' },
  status: 'published',
  ...overrides,
});

function stateWithTasks(tasks = []) {
  const state = createInitialState();
  state.catalog = { items: tasks, status: 'ready', error: '' };
  state.ownTasks = { items: [], status: 'ready', error: '' };
  state.taskSave = { status: 'idle', error: '', task: null };
  state.taskMetadata = { industry: '', direction: '', tags: [] };
  state.fields = Object.fromEntries(Object.values(fieldLabels).map((label) => [label, '']));
  state.workspace = { status: 'ready', error: '' };
  return state;
}

test('empty database renders empty catalog, dashboard, tasks and student lists without placeholders', () => {
  const state = stateWithTasks();
  for (const render of [catalog, dashboard, myTasks, student, myProposals, editor]) {
    const html = render(state);
    assert.doesNotMatch(
      html,
      /Анализ оттока клиентов|Прогнозирование спроса|AI-помощник поддержки|FinTech|Демо-задачи/,
    );
    assert.doesNotMatch(html, /detail\?id=[125]/);
  }
  assert.match(catalog(state), /Пока нет опубликованных задач/);
  assert.match(myTasks(state), /У вас пока нет задач/);
  assert.match(student(state), /Пока нет опубликованных задач/);
});

test('catalog uses actual industry and direction filters and handles absent score', () => {
  const state = stateWithTasks([sampleTask()]);
  const html = catalog(state);
  assert.match(html, /<option value="Образование"/);
  assert.match(html, /<option value="Исследование"/);
  assert.match(html, /Задача пользователя/);
  assert.match(html, /Нет оценки/);
  assert.doesNotMatch(html, /null\/100|undefined\/100|FinTech|Telecom/);
});

test('public task detail uses its stored card, not editor fields, and never exposes business contact', () => {
  const state = stateWithTasks([sampleTask({ id: 2 })]);
  state.currentTaskId = 2;
  state.fields['Контекст'] = 'Несохранённый текст другого черновика';
  const html = detail(state);
  assert.match(html, /Контекст из базы/);
  assert.doesNotMatch(
    html,
    /private@example.com|Несохранённый текст другого черновика|Контакт бизнеса/,
  );
  assert.match(html, /Нет оценки/);
});

test('database task values are escaped in filters, cards, detail and own lists', () => {
  const task = sampleTask({
    title: '<script>title</script>',
    industry: '"><img src=x>',
    direction: '<b>direction</b>',
    description: '<script>description</script>',
    card: { context: '<script>context</script>' },
  });
  const state = stateWithTasks([task]);
  state.currentTaskId = task.id;
  state.ownTasks.items = [task];
  for (const render of [catalog, detail, dashboard, myTasks, student]) {
    const html = render(state);
    assert.doesNotMatch(html, /<script>|<img src=x>|<b>direction/);
    assert.match(html, /&lt;script&gt;title&lt;\/script&gt;/);
  }
});

test('own task rows use persisted identifiers and support draft editing without fake proposal routes', () => {
  const published = taskRow(sampleTask());
  assert.match(published, /detail\?id=47/);
  assert.match(published, /data-action="edit-task"[^>]*data-task-id="47"/);
  assert.doesNotMatch(published, /data-action="proposals"|null\/100/);
  const draft = taskRow(sampleTask({ id: 93, status: 'draft' }));
  assert.match(draft, /data-task-id="93"/);
  assert.match(draft, /Продолжить/);
  assert.doesNotMatch(draft, /detail\?id=/);
});

test('own lists expose loading and retriable escaped errors', () => {
  const state = stateWithTasks();
  state.ownTasks.status = 'loading';
  assert.match(myTasks(state), /role="status">Загружаем ваши задачи/);
  state.ownTasks = { items: [], status: 'error', error: '<script>Ошибка базы</script>' };
  for (const render of [dashboard, myTasks]) {
    const html = render(state);
    assert.match(html, /data-action="retry-my-tasks"/);
    assert.match(html, /&lt;script&gt;Ошибка базы&lt;\/script&gt;/);
    assert.doesNotMatch(html, /<script>/);
  }
});

test('editor renders real metadata and disables duplicate writes with accessible feedback', () => {
  const state = stateWithTasks();
  state.fields['Название'] = 'Мой проект';
  state.taskMetadata = {
    industry: 'Образование',
    direction: '<b>Аналитика</b>',
    tags: ['Данные', 'AI'],
  };
  state.taskSave.status = 'saving';
  const html = editor(state);
  assert.match(html, /<h2>Мой проект<\/h2>/);
  assert.match(html, /data-task-meta="industry"[^>]*value="Образование"/);
  assert.match(html, /data-task-meta="direction"[^>]*value="&lt;b&gt;Аналитика&lt;\/b&gt;"/);
  assert.match(html, /data-task-meta="tags"[^>]*value="Данные, AI"/);
  assert.equal((html.match(/data-save-task disabled/g) || []).length, 2);
  assert.match(html, /role="status"[^>]*>Сохраняем задачу/);
  assert.doesNotMatch(html, /Сформировано с помощью AI/);
});

test('editor shows save errors and published task editing status', () => {
  const state = stateWithTasks();
  state.taskSave = { status: 'error', error: '<script>Ошибка записи</script>', task: null };
  assert.match(editor(state), /role="alert">&lt;script&gt;Ошибка записи/);
  state.taskSave = { status: 'saved', error: '', task: sampleTask() };
  const html = editor(state);
  assert.match(html, /Сохранить изменения/);
  assert.match(html, /Задача сохранена и доступна в каталоге/);
  assert.doesNotMatch(html, /data-action="publish"/);
});

test('workspace restore hides forms until loaded and exposes persistence errors with retry', () => {
  const state = stateWithTasks();
  state.workspace.status = 'loading';
  for (const render of [create, editor]) {
    const html = render(state);
    assert.match(html, /Загружаем ваш рабочий черновик/);
    assert.doesNotMatch(html, /id="description"|data-save-task|data-edit=/);
  }
  state.workspace = { status: 'error', error: '<script>Нет соединения</script>' };
  for (const render of [create, editor]) {
    assert.match(render(state), /data-action="retry-workspace"/);
    assert.match(render(state), /&lt;script&gt;Нет соединения/);
  }
  assert.equal((editor(state).match(/data-save-task disabled/g) || []).length, 2);
  state.workspace.loaded = false;
  for (const render of [create, editor]) {
    const html = render(state);
    assert.match(html, /data-workspace-feedback/);
    assert.match(html, /data-action="retry-workspace"/);
    assert.doesNotMatch(html, /id="description"|data-save-task|data-edit=/);
  }
});
