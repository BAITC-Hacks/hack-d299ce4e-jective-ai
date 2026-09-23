import { btn, I, stat } from '../components/ui.js';
import { layout } from '../components/layout.js';
import { taskRow } from '../components/task-row.js';
import { esc } from '../shared/html.js';
function owned(state) {
  return state.ownTasks?.items || [];
}
function taskList(state) {
  const ownTasks = state.ownTasks || { status: 'idle', error: '' };
  if (ownTasks.status === 'loading' || ownTasks.status === 'idle')
    return '<div class="card empty" role="status">Загружаем ваши задачи…</div>';
  if (ownTasks.status === 'error')
    return `<div class="card empty" role="alert"><h3>Не удалось загрузить ваши задачи</h3><p>${esc(ownTasks.error)}</p>${btn('Попробовать снова', 'retry-my-tasks', 'ghost')}</div>`;
  return `<div class="task-list">${
    owned(state).map(taskRow).join('') ||
    '<div class="card empty"><h3>У вас пока нет задач</h3><p>Создайте задачу, сохраните черновик или опубликуйте её в каталоге.</p></div>'
  }</div>`;
}
export function dashboard(state) {
  const fullName = state.auth.profile?.full_name || '';
  const tasks = owned(state);
  const ready = state.ownTasks?.status === 'ready';
  const published = tasks.filter((task) => task.status === 'published').length;
  return layout(
    `<div class="profile-toolbar"><div><span class="eyebrow">Панель бизнеса</span><h1 class="page-title">Добро пожаловать${fullName ? `, ${esc(fullName)}` : ''}!</h1><p class="sub">Управляйте своими задачами и предложениями команд.</p></div>${btn(I('plus', 16) + ' Создать задачу', 'create')}</div><div class="stats">${stat(ready ? tasks.length : '—', 'Всего задач', 'list')}${stat(ready ? published : '—', 'Опубликовано', 'check')}${stat(ready ? tasks.length - published : '—', 'Черновики', 'edit')}</div><div class="section-head"><h2 class="section-title">Мои задачи</h2><button class="text-btn" data-route="proposals">Открыть отклики →</button></div>${taskList(state)}`,
    'dashboard',
    'business',
    state.auth,
  );
}
export function myTasks(state) {
  return layout(
    `<div class="profile-toolbar"><h1 class="page-title">Мои задачи</h1>${btn('Создать задачу', 'create')}</div>${taskList(state)}`,
    'my-tasks',
    'business',
    state.auth,
  );
}
