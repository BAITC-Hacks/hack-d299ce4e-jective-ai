import { esc } from '../shared/html.js';
import { level } from '../features/tasks/model.js';
import { btn, badge } from './ui.js';

export function taskRow(title, industry, score, status, replies, live, id = 2) {
  let [l, c] = level(score);
  return /* HTML */ `<div class="card task-row">
    <div>
      <h3>${esc(title)}</h3>
      <div class="meta">
        <span>${esc(industry)}</span><span class="score">${esc(score)}/100</span>${badge(l, c)}<span
          >· ${esc(status)}</span
        >${replies ? /* HTML */ `<span>· ${esc(replies)}</span>` : ''}
      </div>
    </div>
    <div class="actions">
      ${btn(live ? 'Открыть' : 'Продолжить', live ? 'detail?id=' + encodeURIComponent(id) : 'editor', 'ghost small')}${live ? btn('Отклики', 'proposals', 'soft small') : ''}
    </div>
  </div>`;
}
