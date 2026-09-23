import { I, btn, badge } from '../components/ui.js';
import { layout } from '../components/layout.js';
import { esc } from '../shared/html.js';
import { proposalList } from '../components/proposal-card.js';

export function student(state) {
  const proposals = state.proposals?.status === 'ready' ? state.proposals.items : null;
  return layout(
    /* HTML */ `<div
        class="card"
        style="background:linear-gradient(120deg,var(--color-accent-soft),var(--color-white));padding:32px"
      >
        <span class="eyebrow">Для студенческих команд</span>
        <h1 class="page-title">Найдите следующую задачу для своей команды</h1>
        <p class="sub" style="margin-bottom:20px">
          Изучайте проекты компаний и предлагайте свои идеи.
        </p>
        ${btn('Открыть каталог ' + I('arrow', 16), 'catalog')}
      </div>
      <div class="stats" style="grid-template-columns:repeat(3,1fr)">
        ${stat(proposals?.length ?? '—', 'Отправлено предложений', 'list')}${stat(proposals?.filter((p) => p.status === 'pending').length ?? '—', 'На рассмотрении', 'clock')}${stat(proposals?.filter((p) => p.status === 'accepted').length ?? '—', 'Принято откликов', 'check')}
      </div>
      <div class="section-head">
        <h2 class="section-title">Новые задачи</h2>
        <button class="text-btn" data-route="catalog">Весь каталог →</button>
      </div>
      ${recentTasks(state)}`,
    'student',
    'student',
    state.auth,
  );
}

function stat(value, label, icon) {
  return `<div class="card stat"><span class="stat-icon">${I(icon)}</span><strong>${esc(value)}</strong><span>${esc(label)}</span></div>`;
}

function recentTasks(state) {
  if (state.catalog.status === 'loading' || state.catalog.status === 'idle') {
    return '<div class="card empty" role="status">Загружаем задачи…</div>';
  }
  if (state.catalog.status === 'error') {
    return `<div class="card empty" role="alert"><p>${esc(state.catalog.error || 'Не удалось загрузить задачи.')}</p>${btn('Попробовать снова', 'retry-catalog', 'ghost')}</div>`;
  }
  const tasks = [...state.catalog.items].sort((a, b) => b.id - a.id).slice(0, 3);
  return `<div class="task-list">${tasks.map((task) => `<div class="card task-row"><div><h3>${esc(task.title)}</h3><p>${esc(task.description)}</p>${task.industry ? badge(esc(task.industry)) : ''}</div>${btn('Открыть задачу', `detail?id=${encodeURIComponent(task.id)}`, 'ghost small')}</div>`).join('') || '<div class="card empty">Пока нет опубликованных задач. Они появятся здесь после публикации бизнесом.</div>'}</div>`;
}

export function myProposals(state) {
  return layout(
    /* HTML */ `<div class="row" style="justify-content:space-between;flex-wrap:wrap">
        <h1 class="page-title">Мои отклики</h1>
        ${btn('Обновить', 'refresh-proposals', 'ghost small', state.proposals?.status === 'loading' ? 'disabled' : '')}
      </div>
      <p class="sub">Ваши сохранённые предложения по задачам бизнеса.</p>
      <div style="margin-top:25px">${proposalList(state)}</div>`,
    'my-proposals',
    'student',
    state.auth,
  );
}
