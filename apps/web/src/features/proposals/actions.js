import { btn } from '../../components/ui.js';

export function createProposalActions({ store, router, feedback }) {
  const { modal, toast, closeModal, success } = feedback;

  return {
    offer() {
      modal(/* HTML */ `
        <h2>Предложить решение</h2>
        <p>Расскажите бизнесу о подходе вашей команды.</p>
        <form id="offer-form">
          <div class="field">
            <label for="offer-team">Команда</label
            ><input id="offer-team" class="input" value="Data Wizards" required />
          </div>
          <div class="field">
            <label for="offer-idea">Идея решения</label
            ><textarea
              id="offer-idea"
              class="textarea"
              placeholder="Как вы планируете решить задачу?"
              required
            ></textarea>
          </div>
          <div class="field">
            <label for="offer-plan">План реализации</label
            ><textarea
              id="offer-plan"
              class="textarea"
              placeholder="Основные этапы работы"
              required
            ></textarea>
          </div>
          <div class="field">
            <label for="offer-deadline">Ожидаемый срок</label
            ><input id="offer-deadline" class="input" placeholder="Например, 2 недели" required />
          </div>
          <div class="field">
            <label for="offer-link">Ссылка на GitHub / прототип</label
            ><input
              id="offer-link"
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
    'confirm-reject'() {
      closeModal();
      toast('Предложение отклонено в деморежиме');
    },
    prototype: () => toast('Ссылка на прототип недоступна в демо'),
  };
}
