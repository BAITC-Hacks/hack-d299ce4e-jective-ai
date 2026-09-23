import { btn } from '../../components/ui.js';
import { esc } from '../../shared/html.js';
import { level } from './model.js';

export function createTaskActions({ store, router, feedback, catalog }) {
  const { modal, toast, closeModal, success } = feedback;
  let editingField = 'Критерии успеха';

  function editField(field, improve = false) {
    if (!Object.hasOwn(store.getState().fields, field)) return;
    editingField = field;
    modal(/* HTML */ `
      <h2>Редактировать: ${esc(field)}</h2>
      <p>
        ${improve ? 'Добавьте измеримые критерии успеха, чтобы повысить готовность задачи.' : 'Уточните информацию в карточке задачи.'}
      </p>
      <div class="field">
        <label for="edit-value">${esc(field)}</label>
        <textarea class="textarea" id="edit-value" style="min-height:135px">
${improve ? '' : esc(store.getState().fields[field])}</textarea>
      </div>
      <div class="actions">${btn('Отмена', 'close', 'ghost')}${btn('Сохранить', 'save-edit')}</div>
    `);
  }

  return {
    editField,
    actions: {
      analyze() {
        const description = document.querySelector('#description')?.value || '';
        store.update((state) => ({ ...state, description }));
        router.navigate('clarify');
      },
      'save-draft': () => toast('Черновик сохранён в текущей демосессии'),
      publish() {
        modal(
          /* HTML */ `<h2>Опубликовать задачу?</h2>
            <p>
              После публикации задача появится в общем каталоге и студенческие команды смогут
              отправлять свои предложения.
            </p>
            <div class="actions">
              ${btn('Отмена', 'close', 'ghost')}${btn('Опубликовать', 'confirm-publish')}
            </div>`,
        );
      },
      'confirm-publish'() {
        store.update((state) => ({ ...state, published: true }));
        const { rating } = store.getState();
        success(
          'Задача опубликована в деморежиме',
          `${rating}/100 · ${level(rating)[0]}`,
          'Посмотреть в каталоге',
          'catalog',
        );
      },
      improve: () => editField('Критерии успеха', true),
      'save-edit'() {
        const value = document.querySelector('#edit-value')?.value.trim();
        if (!value) return toast('Заполните поле перед сохранением');
        const improve = editingField === 'Критерии успеха' && store.getState().rating < 90;
        store.update((state) => ({
          ...state,
          fields: { ...state.fields, [editingField]: value },
          rating: improve ? 91 : state.rating,
        }));
        closeModal();
        router.render();
        toast(improve ? 'Рейтинг повышен на 15 баллов' : 'Изменения сохранены');
      },
      'save-task'() {
        store.update((state) => ({
          ...state,
          saved: !state.saved,
          savedTaskIds: state.saved
            ? state.savedTaskIds.filter((id) => id !== state.currentTaskId)
            : [...state.savedTaskIds, state.currentTaskId],
        }));
        router.render();
        toast(store.getState().saved ? 'Задача сохранена' : 'Задача удалена из сохранённого');
      },
      'retry-catalog': () => catalog.load(),
    },
  };
}
