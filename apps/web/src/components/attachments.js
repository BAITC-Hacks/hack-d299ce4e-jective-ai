import { attachmentAccept } from '@ai-sana/contracts/attachments';
import { esc } from '../shared/html.js';
import { btn } from './ui.js';
import { attachmentsBusy } from '../features/attachments/controller.js';

export function attachmentsPanel(state) {
  const attachments = state.attachments || { status: 'idle', items: [] };
  const busy = attachmentsBusy(state);
  const labels = {
    uploading: 'Загрузка файла…',
    analyzing: 'ИИ читает файл…',
    uploaded: 'Ожидает анализа',
    ready: 'Обработан',
    error: 'Нужна повторная попытка',
    deleting: 'Удаление…',
  };
  return `<section class="attachments-panel" aria-labelledby="attachments-title"><h3 id="attachments-title">Документы и скриншоты</h3><p class="hint">Приложите материалы вместо подробного описания. ИИ извлечёт факты и учтёт выбранные файлы в вопросах и карточке.</p>
    <div class="attachment-drop" data-attachment-drop tabindex="0" aria-label="Область загрузки файлов и вставки скриншотов"><label class="btn ghost attachment-picker" for="task-attachments">Прикрепить файл<input id="task-attachments" type="file" accept="${attachmentAccept}" multiple ${busy ? 'disabled' : ''}/></label><p class="hint">Перетащите файлы сюда или вставьте скриншот (Ctrl+V).<br>PDF, DOCX, XLSX, TXT, CSV, PNG, JPG, WebP · до 5 файлов по 10 МБ.</p></div>
    <p class="hint">Файлы доступны только вам. При загрузке содержимое обрабатывается ИИ для анализа.</p>
    ${attachments.status === 'loading' ? '<p role="status">Загружаем сохранённые вложения…</p>' : ''}
    ${attachments.error ? `<p role="alert" class="attachment-error">${esc(attachments.error)}</p>` : ''}
    ${['idle', 'error'].includes(attachments.status) ? btn('Загрузить сохранённые вложения', 'attachments-reload', 'ghost small') : ''}
    <ul class="attachment-list">${attachments.items
      .map(
        (
          item,
        ) => `<li class="attachment-item"><div class="attachment-heading"><strong>${esc(item.name)}</strong><span>${(item.size_bytes / 1024 / 1024).toFixed(2)} МБ</span></div><p role="status" class="hint">${labels[item.status] || ''}${item.status === 'ready' && !item.selected ? ' · Не включён в анализ' : ''}</p>
      ${item.error ? `<p role="alert" class="attachment-error">${esc(item.error)}</p>` : ''}
      ${item.extracted_context ? `<label class="attachment-toggle"><input type="checkbox" data-attachment-select="${esc(item.id)}" ${item.selected ? 'checked' : ''} ${busy ? 'disabled' : ''}/> Использовать в задаче</label><details><summary>Что извлечено из файла</summary><p>${esc(item.extracted_context.summary)}</p><ul>${item.extracted_context.facts.map((f) => `<li>${esc(f.text)} <span class="hint">(${esc(f.source)})</span></li>`).join('')}</ul>${item.extracted_context.warnings.map((w) => `<p class="hint">⚠ ${esc(w)}</p>`).join('')}</details>` : ''}
      <div class="actions">${['error', 'uploaded'].includes(item.status) ? btn('Повторить обработку', 'attachment-retry', 'ghost small', `data-id="${esc(item.id)}" ${busy ? 'disabled' : ''}`) : ''}${item.storage_path ? btn('Скачать', 'attachment-download', 'ghost small', `data-id="${esc(item.id)}"`) : ''}${btn('Удалить', 'attachment-remove', 'ghost small', `data-id="${esc(item.id)}" ${busy ? 'disabled' : ''}`)}</div></li>`,
      )
      .join('')}</ul>
    <p class="hint">${attachments.items.filter((i) => i.selected && i.status === 'ready').length} из ${attachments.items.length} файлов включено в анализ. Проверьте извлечённые факты; ненужный файл можно исключить.</p></section>`;
}

export function attachmentSources(state) {
  const sources = state.taskAnalysis?.attachmentSources || [];
  if (!sources.length) return '';
  return `<div class="callout"><strong>Материалы задачи</strong><ul>${sources.map((file) => `<li>${esc(file.name)} ${btn('Скачать', 'attachment-download', 'ghost small', `data-id="${esc(file.id)}"`)}</li>`).join('')}</ul><p class="hint">AI учёл извлечённый контекст этих файлов. Изменить набор можно на шаге описания, затем повторить анализ.</p></div>`;
}
