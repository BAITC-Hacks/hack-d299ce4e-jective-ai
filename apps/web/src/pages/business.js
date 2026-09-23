import { I, btn, stat } from '../components/ui.js';
import { layout } from '../components/layout.js';
import { taskRow } from '../components/task-row.js';
import { esc } from '../shared/html.js';

function ownTaskList(state, limit) {
  const ownTasks = state.ownTasks || { items: [], status: 'idle', error: '' };
  if (ownTasks.status === 'error') {
    return `<div class="card empty" role="alert"><h3>Не удалось загрузить ваши задачи</h3><p>${esc(ownTasks.error || 'Попробуйте ещё раз.')}</p>${btn('Попробовать снова', 'retry-my-tasks', 'ghost')}</div>`;
  }
  if (ownTasks.status === 'idle' || ownTasks.status === 'loading') {
    return '<div class="card empty" role="status">Загружаем ваши задачи…</div>';
  }
  const tasks = limit ? ownTasks.items.slice(0, limit) : ownTasks.items;
  return tasks.length
    ? tasks.map(taskRow).join('')
    : '<div class="card empty"><h3>У вас пока нет задач</h3><p>Создайте задачу, сохраните черновик или опубликуйте её в каталоге.</p></div>';
}

export function dashboard(state) {
  const fullName = state.auth?.status === 'authenticated' ? state.auth.profile?.full_name : '';
  const tasks = state.ownTasks?.items || [];
  const ready = state.ownTasks?.status === 'ready';
  const published = tasks.filter((task) => task.status === 'published').length;
  return layout(
    /* HTML */ `<div
        class="row"
        style="justify-content:space-between;align-items:end;flex-wrap:wrap"
      >
        <div>
          <span class="eyebrow">Панель бизнеса</span>
          <h1 class="page-title">Добро пожаловать${fullName ? `, ${esc(fullName)}` : ''}!</h1>
          <p class="sub">Создавайте задачи и управляйте публикациями в каталоге.</p>
        </div>
        ${btn(I('plus', 16) + ' Создать задачу', 'create')}
      </div>
      <div class="stats" style="grid-template-columns:repeat(3,1fr)">
        ${stat(ready ? tasks.length : '—', 'Всего задач', 'list')}${stat(ready ? published : '—', 'Опубликовано', 'check')}${stat(ready ? tasks.length - published : '—', 'Черновики', 'edit')}
      </div>
      <div class="section-head">
        <h2 class="section-title">Мои задачи</h2>
        <button class="text-btn" data-route="my-tasks">Смотреть все →</button>
      </div>
      <div class="task-list">${ownTaskList(state, 5)}</div>`,
    'dashboard',
    'business',
    state.auth,
  );
}

export function myTasks(state) {
  return layout(
    /* HTML */ `<div class="row" style="justify-content:space-between">
        <div>
          <h1 class="page-title">Мои задачи</h1>
          <p class="sub">Сохранённые черновики и опубликованные задачи.</p>
        </div>
        ${btn(I('plus', 16) + ' Создать задачу', 'create')}
      </div>
      <div class="task-list" style="margin-top:30px">${ownTaskList(state)}</div>`,
    'my-tasks',
    'business',
    state.auth,
  );
}
