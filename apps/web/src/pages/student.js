import { I, btn, badge, stat } from '../components/ui.js';
import { layout } from '../components/layout.js';
import { esc } from '../shared/html.js';
import { getTask } from '../features/tasks/model.js';

export function student(state) {
  return layout(
    /* HTML */ `<div
        class="card"
        style="background:linear-gradient(120deg,#eef1ff,#fff);padding:32px"
      >
        <span class="eyebrow">Для студенческих команд</span>
        <h1 class="page-title">Найдите следующую задачу для своей команды</h1>
        <p class="sub" style="margin-bottom:20px">
          Изучайте проекты компаний и предлагайте свои идеи.
        </p>
        ${btn('Открыть каталог ' + I('arrow', 16), 'catalog')}
      </div>
      <div class="stats" style="grid-template-columns:repeat(3,1fr)">
        ${stat(state.proposalSent ? 6 : 5, 'Отправлено предложений', 'list')}${stat(state.proposalSent ? 3 : 2, 'На рассмотрении', 'clock')}${stat(1, 'Команда выбрана', 'check')}
      </div>
      <div class="section-head">
        <h2 class="section-title">Мои отклики</h2>
        <button class="text-btn" data-route="my-proposals">Все отклики →</button>
      </div>
      ${proposalList(state)}`,
    'student',
    'student',
    state.auth,
  );
}

function proposalList(state) {
  const proposedTask = getTask(state, state.proposedTaskId);
  const previousProposals = [
    ['Анализ оттока клиентов', 'На рассмотрении', 'review', 2],
    ['Прогнозирование спроса', 'Команда выбрана', 'selected', 1],
    ['AI-помощник поддержки', 'Отклонено', 'rejected', 3],
  ];
  return /* HTML */ `<div class="task-list">
    ${previousProposals
      .map(
        ([title, status, kind, id]) =>
          /* HTML */ ` <div class="card task-row">
            <div>
              <h3>${esc(title)}</h3>
              ${badge(status, kind)}
            </div>
            ${btn('Открыть задачу', `detail?id=${id}`, 'ghost small')}
          </div>`,
      )
      .join('')}${
      state.proposalSent && state.proposedTaskId !== null
        ? /* HTML */ ` <div class="card task-row">
            <div>
              <h3>${esc(proposedTask?.title || 'Задача недоступна')}</h3>
              ${badge('На рассмотрении', 'review')}
            </div>
            ${btn('Открыть задачу', `detail?id=${encodeURIComponent(state.proposedTaskId)}`, 'ghost small')}
          </div>`
        : ''
    }
  </div>`;
}

export function myProposals(state) {
  return layout(
    /* HTML */ `<h1 class="page-title">Мои отклики</h1>
      <p class="sub">Следите за статусом предложений вашей команды.</p>
      <div style="margin-top:25px">${proposalList(state)}</div>`,
    'my-proposals',
    'student',
    state.auth,
  );
}
