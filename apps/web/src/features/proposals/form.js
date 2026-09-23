import { btn } from '../../components/ui.js';
import { esc } from '../../shared/html.js';

export function emptyProposalForm() {
  return {
    taskId: null,
    values: { teamName: '', idea: '', plan: '', deadline: '', prototypeUrl: '' },
    status: 'idle',
    error: '',
  };
}

export function proposalFormMarkup(form) {
  const values = form.values;
  return /* HTML */ `
    <h2>Предложить решение</h2>
    <p>Расскажите бизнесу о подходе вашей команды. Все поля отклика увидит владелец задачи.</p>
    <form id="offer-form">
      <div class="field">
        <label for="offer-team">Команда</label>
        <input
          id="offer-team"
          name="teamName"
          class="input"
          maxlength="200"
          value="${esc(values.teamName)}"
          required
        />
      </div>
      <div class="field">
        <label for="offer-idea">Идея решения</label>
        <textarea
          id="offer-idea"
          name="idea"
          class="textarea"
          maxlength="10000"
          placeholder="Как вы планируете решить задачу?"
          required
        >
${esc(values.idea)}</textarea>
      </div>
      <div class="field">
        <label for="offer-plan">План реализации</label>
        <textarea
          id="offer-plan"
          name="plan"
          class="textarea"
          maxlength="10000"
          placeholder="Основные этапы работы"
          required
        >
${esc(values.plan)}</textarea>
      </div>
      <div class="field">
        <label for="offer-deadline">Ожидаемый срок</label>
        <input
          id="offer-deadline"
          name="deadline"
          class="input"
          maxlength="200"
          value="${esc(values.deadline)}"
          placeholder="Например, 2 недели"
          required
        />
      </div>
      <div class="field">
        <label for="offer-link">Ссылка на GitHub / прототип</label>
        <input
          id="offer-link"
          name="prototypeUrl"
          class="input"
          type="url"
          maxlength="2048"
          value="${esc(values.prototypeUrl)}"
          placeholder="https://github.com/... (необязательно)"
        />
      </div>
      <p data-proposal-error role="alert" ${form.error ? '' : 'hidden'}>${esc(form.error)}</p>
      <div class="actions">
        ${btn('Отмена', 'close', 'ghost')}
        <button type="submit" class="btn primary">Отправить предложение</button>
      </div>
    </form>
  `;
}

/** Update feedback in place so a failed request never erases the user's inputs. */
export function syncProposalForm(state) {
  const element = document.querySelector('#offer-form');
  if (!element) return;
  const { status, error } = state.proposalForm;
  const busy = status === 'saving';
  element.setAttribute('aria-busy', String(busy));
  const message = element.querySelector('[data-proposal-error]');
  message.textContent = error;
  message.hidden = !error;
  for (const input of element.querySelectorAll('input,textarea,button')) input.disabled = busy;
  element.querySelector('[type="submit"]').textContent = busy
    ? 'Отправляем…'
    : 'Отправить предложение';
}
