import { btn, I, stat } from '../components/ui.js';
import { layout } from '../components/layout.js';
import { taskRow } from '../components/task-row.js';
import { esc } from '../shared/html.js';
function owned(state) {
  return state.catalog.items.filter((t) => t.ownerId === state.auth.user?.id && t.ownerId);
}
function taskList(state) {
  if (state.catalog.status === 'loading' || state.catalog.status === 'idle')
    return '<p role="status">Загрузка задач…</p>';
  if (state.catalog.status === 'error')
    return `<p role="alert">${esc(state.catalog.error)}</p>${btn('Повторить', 'retry-catalog', 'ghost')}`;
  return `<div class="task-list">${
    owned(state)
      .map((t) => taskRow(t.title, t.industry, t.score, 'Опубликована', '', true, t.id))
      .join('') || '<div class="card empty">У вас пока нет опубликованных задач.</div>'
  }</div>`;
}
export function dashboard(state) {
  const fullName = state.auth.profile?.full_name || '';
  return layout(
    `<div class="profile-toolbar"><div><span class="eyebrow">Панель бизнеса</span><h1 class="page-title">Добро пожаловать${fullName ? `, ${esc(fullName)}` : ''}!</h1><p class="sub">Управляйте своими задачами и предложениями команд.</p></div>${btn(I('plus', 16) + ' Создать задачу', 'create')}</div><div class="stats">${stat(owned(state).length, 'Опубликовано задач', 'list')}</div><div class="section-head"><h2 class="section-title">Мои задачи</h2><button class="text-btn" data-route="proposals">Открыть отклики →</button></div>${taskList(state)}`,
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
