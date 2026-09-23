import { attachmentsPanel, attachmentSources } from '../components/attachments.js';
import { attachmentsBusy } from '../features/attachments/controller.js';
import { voiceInput } from '../components/voice-input.js';
import { esc } from '../shared/html.js';
import { I, btn, badge, progress } from '../components/ui.js';
import { fieldLabels, initialAnalysis } from '../services/ai/types.js';
import { layout } from '../components/layout.js';

const stepper = (n) =>
  /* HTML */ `<div class="stepper">
    ${['Описание', 'Уточнение', 'Карточка', 'Публикация'].map((s, i) => `${i ? '<span class="step-line"></span>' : ''}<span class="step-item ${i + 1 === n ? 'current' : i + 1 < n ? 'done' : ''}"><i>${i + 1 < n ? '✓' : i + 1}</i>${s}</span>`).join('')}
  </div>`;

function workspaceFeedbackContent(state) {
  if (state.workspace?.status === 'error') {
    return `<div class="card" role="alert"><p>${esc(state.workspace.error || 'Не удалось сохранить рабочий черновик.')}</p>${btn('Повторить синхронизацию', 'retry-workspace', 'ghost small')}</div>`;
  }
  if (state.workspace?.status === 'saving') {
    return '<p class="hint" role="status">Сохраняем описание и ответы…</p>';
  }
  if (state.workspace?.status === 'ready') {
    return '<p class="hint" role="status">Рабочий черновик сохранён в вашем аккаунте.</p>';
  }
  return '';
}

export function workspaceFeedback(state) {
  return `<div data-workspace-feedback>${workspaceFeedbackContent(state)}</div>`;
}

function workspaceLoading(state, page) {
  return layout(
    '<div class="card empty" role="status">Загружаем ваш рабочий черновик…</div>',
    page,
    'business',
    state.auth,
  );
}

function analysisContent(state, flow) {
  if (flow.step === 'analyzing' || flow.step === 'generating') {
    return `<div class="card form-card" role="status" aria-live="polite" aria-busy="true"><p>${flow.step === 'analyzing' ? 'AI анализирует вашу задачу...' : 'AI формирует карточку задачи...'}</p></div>`;
  }
  if (flow.step === 'error') {
    return `<div class="card form-card"><div role="alert"><h3>Не удалось выполнить AI-анализ.</h3><p>${esc(flow.error)}</p></div><div class="actions">${btn('Попробовать снова', 'analysis-retry')}${btn(flow.retry === 'generating' ? 'Вернуться к вопросам' : 'Изменить описание', flow.retry === 'generating' ? 'analysis-questions' : 'analysis-description', 'ghost')}</div></div>`;
  }
  if (flow.step === 'questions') {
    const q = flow.questions[flow.currentQuestion];
    if (!q) return '';
    return `<div class="card form-card"><h2>AI уточняет задачу</h2><p>Известно: ${esc(flow.knownInformation.join(' '))}</p><p class="hint">Требует уточнения: ${esc(flow.missingInformation.map((key) => fieldLabels[key] || key).join(', '))}</p><p role="status">Вопрос ${flow.currentQuestion + 1} из ${flow.questions.length}</p>${progress(((flow.currentQuestion + 1) / flow.questions.length) * 100)}<div class="field"><label for="analysis-answer">${esc(q.text)}</label><textarea id="analysis-answer" class="textarea" data-analysis-answer="${esc(q.id)}" placeholder="Напишите ответ или оставьте пустым, если информация неизвестна">${esc(flow.answers[q.id] || '')}</textarea>${voiceInput(state, `answer:${q.id}`)}</div><p class="hint">Почему спрашиваем: ${esc(q.reason)}</p><div class="actions" style="justify-content:space-between">${btn('Назад', flow.currentQuestion ? 'analysis-back' : 'analysis-description', 'ghost')}${btn(flow.currentQuestion + 1 === flow.questions.length ? 'Сформировать карточку' : 'Далее', 'analysis-next')}</div></div>`;
  }
  if (flow.step === 'result') {
    return `<div class="card form-card"><h2>✓ AI-анализ завершён</h2><p class="hint">Проверьте и при необходимости отредактируйте поля. Пустое поле означает, что информация не указана.</p>${Object.entries(
      fieldLabels,
    )
      .map(
        ([key, label]) =>
          `<div class="field"><label for="analysis-${key}">${label}</label><textarea id="analysis-${key}" class="textarea" data-analysis-field="${key}" placeholder="Не указано">${esc(flow.analysisResult[key])}</textarea></div>`,
      )
      .join(
        '',
      )}<div id="analysis-missing" aria-live="polite">${missingFeedback(flow.analysisResult)}</div><div class="actions">${btn('Вернуться к вопросам', 'analysis-questions', 'ghost')}${btn('Принять результат', 'analysis-accept')}</div></div>`;
  }
  return `<div class="card form-card"><div class="field"><label for="description">Опишите задачу или проблему</label><textarea id="description" class="textarea" placeholder="Мы образовательный центр и хотим понять, почему часть учеников бросает обучение.">${esc(state.description)}</textarea>${voiceInput(state, 'description')}</div>${attachmentsPanel(state)}<p class="hint">Кратко опишите цель или оставьте поле пустым, если она понятна из вложений.</p><div class="actions" style="justify-content:flex-end">${btn(I('spark', 16) + ' Проанализировать с AI', 'analyze', 'primary', attachmentsBusy(state) ? 'disabled' : '')}</div></div>`;
}

export function missingFeedback(result) {
  return result.missingInformation.length
    ? `<p>Что ещё желательно уточнить:</p><ul>${result.missingInformation.map((key) => `<li>⚠ ${esc(fieldLabels[key])}: не указано</li>`).join('')}</ul>`
    : '<p>Все поля заполнены. Проверьте достоверность информации.</p>';
}

export function create(state) {
  if (state.workspace?.status === 'loading') return workspaceLoading(state, 'create');
  if (state.workspace?.status === 'error' && state.workspace.loaded === false) {
    return layout(workspaceFeedback(state), 'create', 'business', state.auth);
  }
  const flow = state.taskAnalysis || initialAnalysis();
  const step = ['questions', 'generating'].includes(flow.step) ? 2 : flow.step === 'result' ? 3 : 1;
  return layout(
    `<div class="narrow">${stepper(step)}<span class="eyebrow">Шаг ${step} из 4</span><h1 class="page-title">Опишите вашу бизнес-задачу</h1><p class="sub">Опишите проблему своими словами — AI поможет оформить её правильно.</p><p class="hint">ИИ анализирует описание и ответы. Проверьте результат перед публикацией.</p>${analysisContent(state, flow)}${flow.step !== 'description' ? attachmentSources(state) : ''}</div>`,
    'create',
    'business',
    state.auth,
  );
}

// Preserve the existing route without a second clarification form.
export function clarify(state) {
  return create(state);
}

function rating(state) {
  const scoring = state.aiScoring;
  let content;
  if (scoring?.status === 'loading') {
    content = '<p role="status" aria-live="polite">ИИ оценивает качество карточки...</p>';
  } else if (scoring?.status === 'error') {
    content = `<p role="alert">${esc(scoring.error)}</p>${btn('Повторить AI-Scoring', 'score-task', 'ghost small')}`;
  } else if (scoring?.status === 'ready') {
    const result = scoring.result;
    const summary =
      result.summary.length > 220
        ? `<details class="scoring-summary"><summary>Общий вывод AI</summary><p>${esc(result.summary)}</p></details>`
        : `<p class="scoring-summary">${esc(result.summary)}</p>`;
    content = `<div class="score-large">${result.score}<small>/100</small></div>${progress(result.score)}${summary}<p class="hint">Нажмите на критерий, чтобы увидеть пояснение и рекомендацию.</p><div class="scoring-criteria">${result.criteria.map((criterion) => `<details class="scoring-criterion"><summary><span>${esc(criterion.label)}</span><strong>${criterion.score}/${criterion.maxScore}</strong></summary><div class="scoring-feedback"><p>${esc(criterion.explanation)}</p><div class="scoring-recommendation"><strong>Как улучшить</strong><p>${esc(criterion.recommendation)}</p></div></div></details>`).join('')}</div>${btn('Пересчитать оценку', 'score-task', 'ghost small')}`;
  } else {
    content = `<p>Оцените конкретность, полноту и проверяемость задачи.</p>${btn('Оценить с AI', 'score-task', 'ghost small')}`;
  }
  return `<aside class="card rating ai-scoring"><h3>AI-Scoring</h3>${content}<p class="hint">Оценка качества постановки задачи, а не проверка достоверности фактов. После редактирования оценка пересчитывается через ИИ.</p></aside>`;
}

export function editor(state) {
  if (state.workspace?.status === 'loading') return workspaceLoading(state, 'editor');
  if (state.workspace?.status === 'error' && state.workspace.loaded === false) {
    return layout(workspaceFeedback(state), 'editor', 'business', state.auth);
  }
  const metadata = state.taskMetadata || { industry: '', direction: '', tags: [] };
  const save = state.taskSave || { status: 'idle', error: '', task: null };
  const busy = save.status === 'saving';
  const saveDisabled = busy || state.workspace?.status === 'error';
  const published = save.task?.status === 'published';
  const title = state.fields['Название']?.trim() || 'Новая задача';
  const hasContent = Object.values(state.fields).some((value) => value?.trim());
  const saveFeedback =
    save.status === 'error'
      ? `<p role="alert">${esc(save.error || 'Не удалось сохранить задачу. Попробуйте снова.')}</p>`
      : save.status === 'saving'
        ? '<p role="status" aria-live="polite">Сохраняем задачу…</p>'
        : save.status === 'saved'
          ? `<p role="status">${published ? 'Задача сохранена и доступна в каталоге.' : 'Черновик сохранён. Он виден только вам.'}</p>`
          : '';
  return layout(
    `${stepper(3)}<div class="row" style="justify-content:space-between;flex-wrap:wrap"><div><span class="eyebrow">Шаг 3 из 4</span><h1 class="page-title">Карточка задачи</h1><p class="sub">Проверьте информацию перед публикацией.</p></div>${state.acceptedAnalysis ? badge(I('spark', 13) + ' Сформировано с помощью AI', 'soft') : ''}</div>${!hasContent ? `<div class="card empty"><p>Добавьте описание через AI-анализ или заполните поля карточки вручную.</p>${btn('Описать задачу', 'create', 'ghost')}</div>` : ''}<div class="editor-grid"><div class="card editor-card"><div class="row">${metadata.industry ? badge(esc(metadata.industry)) : ''}${badge(published ? 'Опубликована' : 'Черновик', published ? 'ready' : 'draft')}</div><h2>${esc(title)}</h2><div class="field"><label for="task-industry">Отрасль</label><input id="task-industry" class="input" data-task-meta="industry" maxlength="100" value="${esc(metadata.industry)}" placeholder="Укажите отрасль" ${busy ? 'disabled' : ''}/></div><div class="field"><label for="task-direction">Направление</label><input id="task-direction" class="input" data-task-meta="direction" maxlength="100" value="${esc(metadata.direction)}" placeholder="Необязательно" ${busy ? 'disabled' : ''}/></div><div class="field"><label for="task-tags">Теги через запятую</label><input id="task-tags" class="input" data-task-meta="tags" value="${esc(metadata.tags.join(', '))}" placeholder="Необязательно" ${busy ? 'disabled' : ''}/></div>${Object.entries(
      state.fields,
    )
      .map(
        ([key, val]) =>
          /* HTML */ `<section class="info-section">
            <div class="edit-row">
              <div>
                <h3>${esc(key)}</h3>
                <p>${val ? esc(val) : 'Не указано'}</p>
                ${key === 'Контакт бизнеса' ? '<p class="hint">Контакт не отображается в публичном каталоге.</p>' : ''}
              </div>
              <button
                class="icon-btn"
                data-edit="${esc(key)}"
                aria-label="Редактировать: ${esc(key)}"
                ${busy ? 'disabled' : ''}
              >
                ${I('edit', 15)}
              </button>
            </div>
          </section>`,
      )
      .join(
        '',
      )}</div>${rating(state)}</div>${attachmentSources(state)}<div class="editor-actions">${btn('Сохранить черновик', 'save-draft', 'ghost')}${btn('Опубликовать задачу ' + I('arrow', 16), 'publish')}</div>`,
    'editor',
    'business',
    state.auth,
  );
}
