import { btn } from '../../components/ui.js';
import { esc } from '../../shared/html.js';

export function createTaskActions({
  store,
  router,
  feedback,
  catalog,
  scoring,
  publication,
  workspace,
}) {
  const { modal, toast, closeModal } = feedback;
  let editingField = 'Критерии успеха';

  function editField(field, improve = false) {
    if (store.getState().taskSave.status === 'saving') return;
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
      'save-draft': () => publication.save('draft'),
      'retry-my-tasks': () => publication.loadMine(),
      'retry-workspace': () => workspace.retry(),
      publish() {
        if (store.getState().taskSave.status === 'saving') return;
        modal(
          /* HTML */ `<h2>Опубликовать задачу?</h2>
            <p>
              После публикации поля карточки появятся в общем каталоге. Исходное описание, ответы на
              вопросы AI и контакт бизнеса останутся доступны только вам.
            </p>
            <div class="actions">
              ${btn('Отмена', 'close', 'ghost')}${btn('Опубликовать', 'confirm-publish')}
            </div>`,
        );
      },
      'confirm-publish': () => publication.save('published'),
      improve: () => editField('Критерии успеха', true),
      'save-edit'() {
        if (store.getState().taskSave.status === 'saving') return;
        const value = document.querySelector('#edit-value')?.value.trim();
        if (!value) return toast('Заполните поле перед сохранением');
        store.update((state) => ({
          ...state,
          fields: { ...state.fields, [editingField]: value },
        }));
        closeModal();
        router.render();
        toast('Изменения сохранены');
        void scoring.score();
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
