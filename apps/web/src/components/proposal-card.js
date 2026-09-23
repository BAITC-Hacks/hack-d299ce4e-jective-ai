import { badge, btn } from './ui.js';
import { esc } from '../shared/html.js';

function prototypeLink(value) {
  if (!value) return '<p class="hint">Прототип не приложен.</p>';
  let url;
  try {
    url = new URL(value);
  } catch {
    return '<p class="hint">Ссылка на прототип недоступна.</p>';
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    return '<p class="hint">Ссылка на прототип недоступна.</p>';
  }
  return `<a class="btn ghost small" href="${esc(url.href)}" target="_blank" rel="noopener noreferrer">Открыть прототип</a>`;
}

function timestampMarkup(value) {
  const timestamp = typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(timestamp)
    ? `<time datetime="${esc(value)}">${esc(new Date(timestamp).toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }))}</time>`
    : null;
}

function decisionControls(proposal, decision) {
  const saving = decision?.status === 'saving';
  const ownFeedback = decision?.id === proposal.id;
  const message =
    ownFeedback && saving
      ? '<p role="status">Сохраняем решение…</p>'
      : ownFeedback && decision?.status === 'error'
        ? `<p role="alert">${esc(decision.error || 'Не удалось сохранить решение. Попробуйте ещё раз.')}</p>`
        : '';
  const attribute = `data-proposal-id="${esc(proposal.id)}"`;
  return `<div class="actions">${btn('Принять', 'accept-proposal', 'primary small', `${attribute} ${saving || proposal.status === 'accepted' ? 'disabled' : ''}`)}${btn('Отклонить', 'reject-proposal', 'danger small', `${attribute} ${saving || proposal.status === 'rejected' ? 'disabled' : ''}`)}</div>${message}`;
}

export function proposalCard(proposal, { canDecide = false, decision = null } = {}) {
  const date = timestampMarkup(proposal.createdAt) || 'Дата не указана';
  const statuses = {
    pending: ['На рассмотрении', 'review'],
    accepted: ['Принят', 'ready'],
    rejected: ['Отклонён', 'draft'],
  };
  const status = Object.hasOwn(statuses, proposal.status)
    ? statuses[proposal.status]
    : ['Статус недоступен', 'soft'];
  const decidedAt = timestampMarkup(proposal.decidedAt);
  const task =
    Number.isSafeInteger(proposal.taskId) && proposal.taskId > 0
      ? `<a class="text-btn" href="#/detail?id=${proposal.taskId}">${esc(proposal.taskTitle)}</a>`
      : esc(proposal.taskTitle);
  const profile =
    typeof proposal.counterpartId === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(proposal.counterpartId)
      ? `<a class="btn ghost small" href="#/profile?user=${encodeURIComponent(proposal.counterpartId)}">${canDecide ? 'Профиль студента' : 'Профиль участника'}</a>`
      : '';
  return /* HTML */ `<article
    class="card proposal-card"
    data-proposal-id="${esc(proposal.id)}"
    ${canDecide && decision?.id === proposal.id && decision?.status === 'saving' ? 'aria-busy="true"' : ''}
  >
    <div class="row" style="justify-content:space-between;flex-wrap:wrap">
      <h2>${esc(proposal.teamName)}</h2>
      <span class="muted">${date}</span>
    </div>
    <div class="row">${badge(status[0], status[1])}</div>
    ${decidedAt ? `<p class="hint">Решение обновлено: ${decidedAt}</p>` : ''}
    <p><strong>Задача:</strong> ${task}</p>
    <section class="info-section">
      <h3>Идея решения</h3>
      <p style="white-space:pre-wrap">${esc(proposal.idea)}</p>
    </section>
    <section class="info-section">
      <h3>План работы</h3>
      <p style="white-space:pre-wrap">${esc(proposal.plan)}</p>
    </section>
    <section class="info-section">
      <h3>Срок выполнения</h3>
      <p style="white-space:pre-wrap">${esc(proposal.deadline)}</p>
    </section>
    <div class="actions">${prototypeLink(proposal.prototypeUrl)}${profile}</div>
    ${canDecide ? decisionControls(proposal, decision) : ''}
  </article>`;
}

/** Both role-specific pages receive only their API-filtered private proposal list. */
export function proposalList(state, { business = false } = {}) {
  const proposals = state.proposals || { items: [], status: 'idle', error: '' };
  if (['idle', 'loading'].includes(proposals.status)) {
    return '<div class="card empty" role="status">Загружаем отклики…</div>';
  }
  if (proposals.status === 'error') {
    return `<div class="card empty" role="alert"><p>${esc(proposals.error || 'Не удалось загрузить отклики.')}</p>${btn('Попробовать снова', 'retry-proposals', 'ghost')}</div>`;
  }
  if (!proposals.items.length) {
    return `<div class="card empty"><p>${business ? 'На ваши задачи пока нет откликов.' : 'Вы пока не отправили ни одного отклика.'}</p>${business ? '' : btn('Найти задачу', 'catalog', 'ghost')}</div>`;
  }
  const auth = state.auth;
  const canDecide = Boolean(
    business &&
    auth?.status === 'authenticated' &&
    auth.user?.id &&
    auth.profile?.id === auth.user.id &&
    auth.profile.role === 'business',
  );
  return `<div class="task-list">${proposals.items.map((proposal) => proposalCard(proposal, { canDecide, decision: state.proposalDecision })).join('')}</div>`;
}
