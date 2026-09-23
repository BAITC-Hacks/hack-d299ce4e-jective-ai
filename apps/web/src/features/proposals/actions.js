import { btn } from '../../components/ui.js';
import { getTask } from '../tasks/model.js';

export function createProposalActions({ store, router, feedback }) {
  const { modal, toast, closeModal, success } = feedback;

export function createProposalActions({ store, feedback, proposals }) {
  function requireStudent() {
    if (canProposeSolution(store.getState().auth)) return true;
    feedback.toast('Предлагать решения могут только пользователи, вошедшие как студент.');
    return false;
  }
  return {
    offer() {
      const state = store.getState();
      const task = getTask(state);
      if (state.auth.profile?.role !== 'student')
        return toast('Откликнуться на задачу может студент.');
      if (!task?.ownerId)
        return toast('Это демонстрационная задача. Выберите опубликованную задачу с заказчиком.');
      modal(/* HTML */ `
        <h2>Предложить решение</h2>
        <p>Расскажите бизнесу о подходе вашей команды.</p>
        <form id="offer-form" data-task-id="${task.id}">
          <div class="field">
            <label for="offer-team">Команда</label
            ><input
              id="offer-team"
              name="team"
              class="input"
              placeholder="Название команды или ваше имя"
              maxlength="120"
              required
            />
          </div>
          <div class="field">
            <label for="offer-idea">Идея решения</label
            ><textarea
              id="offer-idea"
              name="idea"
              maxlength="5000"
              class="textarea"
              placeholder="Как вы планируете решить задачу?"
              required
            ></textarea>
          </div>
          <div class="field">
            <label for="offer-plan">План реализации</label
            ><textarea
              id="offer-plan"
              name="plan"
              maxlength="5000"
              class="textarea"
              placeholder="Основные этапы работы"
              required
            ></textarea>
          </div>
          <div class="field">
            <label for="offer-deadline">Ожидаемый срок</label
            ><input
              id="offer-deadline"
              name="deadline"
              maxlength="120"
              class="input"
              placeholder="Например, 2 недели"
              required
            />
          </div>
          <div class="field">
            <label for="offer-link">Ссылка на GitHub / прототип</label
            ><input
              id="offer-link"
              name="link"
              maxlength="500"
              class="input"
              type="url"
              placeholder="https://github.com/... (необязательно)"
            />
          </div>
          <div class="actions">
            ${btn('Отмена', 'close', 'ghost')}<button type="submit" class="btn primary">
              Отправить предложение
            </button>
          </div>
        </form>
      `);
    },
    'offer-success'() {
      store.update((state) => ({
        ...state,
        proposalSent: true,
        proposedTaskId: state.currentTaskId,
      }));
      success(
        'Предложение отправлено в деморежиме',
        'Бизнес рассмотрит ваше предложение и самостоятельно примет решение.',
        'Мои отклики',
        'my-proposals',
      );
    },
    choose() {
      modal(
        /* HTML */ `<h2>Выбрать Data Wizards?</h2>
          <p>Подтвердите выбор команды для работы над задачей «Анализ оттока клиентов».</p>
          <div class="actions">
            ${btn('Отмена', 'close', 'ghost')}${btn('Подтвердить выбор', 'confirm-team')}
          </div>`,
      );
    },
    'confirm-team'() {
      store.update((state) => ({ ...state, selected: true }));
      closeModal();
      router.render();
      toast('Команда выбрана');
    },
    reject() {
      modal(
        /* HTML */ `<h2>Отклонить предложение?</h2>
          <p>Статус отклика команды изменится в этом демонстрационном сценарии.</p>
          <div class="actions">
            ${btn('Отмена', 'close', 'ghost')}${btn('Отклонить', 'confirm-reject', 'danger')}
          </div>`,
      );
    },
    'offer-success'(values) {
      if (!requireStudent()) return;
      return proposals.submit(values);
    },
    'retry-proposals': () => proposals.load({ force: true }),
    'refresh-proposals': () => proposals.load({ force: true }),
    'accept-proposal': (id) => proposals.decide(id, 'accepted'),
    'reject-proposal': (id) => proposals.decide(id, 'rejected'),
  };
}
