import { esc } from '../shared/html.js';
import { level } from '../features/tasks/model.js';
import { btn, badge } from './ui.js';

export function taskRow(task) {
  const [readiness, kind] = task.score === null ? ['Нет оценки', 'soft'] : level(task.score);
  const published = task.status === 'published';
  return /* HTML */ `<div class="card task-row">
    <div>
      <h3>${esc(task.title)}</h3>
      <div class="meta">
        ${task.industry ? `<span>${esc(task.industry)}</span>` : ''}
        ${task.score === null ? '' : `<span class="score">${esc(task.score)}/100</span>`}
        ${badge(readiness, kind)}<span>· ${published ? 'Опубликована' : 'Черновик'}</span>
      </div>
    </div>
    <div class="actions">
      ${published ? btn('Открыть', `detail?id=${encodeURIComponent(task.id)}`, 'ghost small') : ''}
      ${btn(published ? 'Редактировать' : 'Продолжить', 'edit-task', 'ghost small', `data-task-id="${esc(task.id)}"`)}
    </div>
  </div>`;
}
