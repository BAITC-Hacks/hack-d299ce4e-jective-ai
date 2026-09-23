import { esc } from '../shared/html.js';
import { badge } from './ui.js';
export function proposalCards(state, business = false) {
  const data = state.proposalsData;
  if (!data || data.status === 'loading') return '<p role="status">Загрузка откликов…</p>';
  if (data.error)
    return `<p role="alert">${esc(data.error)}</p><button class="btn ghost" data-action="reload-proposals">Повторить</button>`;
  if (!data.items?.length) return '<div class="card empty">Откликов пока нет.</div>';
  return `<div class="task-list">${data.items
    .map((item) => {
      const [label, style] = {
        pending: ['На рассмотрении', 'review'],
        selected: ['Команда выбрана', 'selected'],
        rejected: ['Отклонено', 'rejected'],
      }[item.status] || ['На рассмотрении', 'review'];
      const profileId = business ? item.student_id : item.task?.owner_id;
      return `<article class="card proposal-card"><div class="profile-toolbar"><h3>${esc(item.task?.title || 'Задача')}</h3>${badge(label, style)}</div><p><strong>${esc(item.team)}</strong>${business ? ` · ${esc(item.student?.full_name || 'Студент')}` : ''}</p><div class="actions">${profileId ? `<a class="btn ghost small" href="#/profile?user=${esc(profileId)}">${business ? 'Профиль студента' : 'Профиль заказчика'}</a>` : ''}<a class="btn ghost small" href="#/detail?id=${esc(item.task_id)}">Открыть задачу</a></div><details class="proposal-details"><summary>Посмотреть отклик</summary><h4>Идея решения</h4><p>${esc(item.idea)}</p><h4>План</h4><p>${esc(item.plan)}</p><p><strong>Срок:</strong> ${esc(item.deadline)}</p>${/^https:\/\//i.test(item.link) ? `<a href="${esc(item.link)}" target="_blank" rel="noopener noreferrer">Прототип / портфолио ↗</a>` : ''}</details>${business && item.status === 'pending' ? `<div class="actions"><button class="btn primary small" data-action="proposal-select" data-id="${esc(item.id)}">Выбрать</button><button class="btn ghost small" data-action="proposal-reject" data-id="${esc(item.id)}">Отклонить</button></div>` : ''}</article>`;
    })
    .join('')}</div>`;
}
