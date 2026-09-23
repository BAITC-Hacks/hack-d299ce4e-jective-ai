import { validateTaskWrite } from '@ai-sana/contracts';
import { fieldLabels, initialAnalysis, withMissingInformation } from '../../services/ai/types.js';
import { taskCard } from './workspace-controller.js';

export function createPublicationController({
  store,
  repository,
  catalog,
  workspace,
  router,
  feedback,
  createId = () => crypto.randomUUID(),
}) {
  let disposed = false;
  let mineRequest;
  let mineOwner;
  let mineVersion = 0;
  const patch = (values) => {
    store.update((state) => ({ ...state, taskSave: { ...state.taskSave, ...values } }));
    router.render();
  };
  function reset() {
    mineVersion += 1;
    mineOwner = undefined;
    mineRequest = undefined;
  }
  async function loadMine({ force = false } = {}) {
    const auth = store.getState().auth;
    if (disposed || auth.status !== 'authenticated' || auth.profile.role !== 'business') return;
    const userId = auth.user.id;
    if (mineOwner === userId && mineRequest) {
      if (force) return mineRequest.then(() => loadMine());
      return mineRequest;
    }
    mineOwner = userId;
    const version = ++mineVersion;
    store.update((state) => ({
      ...state,
      ownTasks: { ...state.ownTasks, status: 'loading', error: '' },
    }));
    router.render();
    const current = () =>
      !disposed && version === mineVersion && store.getState().auth.user?.id === userId;
    mineRequest = Promise.resolve()
      .then(() => repository.mine({ userId }))
      .then((items) => {
        if (!current()) return;
        store.update((state) => ({
          ...state,
          ownTasks: { items, status: 'ready', error: '' },
          taskSave: {
            ...state.taskSave,
            task: items.find((task) => task.id === state.taskSave.task?.id) || state.taskSave.task,
          },
        }));
      })
      .catch((error) => {
        if (current())
          store.update((state) => ({
            ...state,
            ownTasks: {
              items: [],
              status: 'error',
              error: error.message || 'Не удалось загрузить ваши задачи.',
            },
          }));
      })
      .finally(() => {
        if (current()) {
          mineRequest = undefined;
          router.render();
        }
      });
    return mineRequest;
  }
  return {
    loadMine,
    reset,
    async save(status) {
      const state = store.getState();
      if (disposed || state.taskSave.status === 'saving') return false;
      if (state.auth.status !== 'authenticated') {
        router.navigate('login');
        return false;
      }
      if (state.auth.profile.role !== 'business') {
        feedback.toast('Размещать задачи может аккаунт бизнеса.');
        return false;
      }
      if (!state.workspace.loaded) {
        feedback.toast('Сначала загрузите черновик из Supabase.');
        return false;
      }
      const userId = state.auth.user.id;
      const scope = workspace.scope();
      const requestId = state.taskSave.requestId || createId();
      let payload;
      try {
        payload = validateTaskWrite({
          requestId,
          status: state.taskSave.task?.status === 'published' ? 'published' : status,
          description: state.description,
          card: taskCard(state),
          ...state.taskMetadata,
          score: state.rating,
        });
      } catch (error) {
        patch({ status: 'error', error: error.message });
        return false;
      }
      patch({ status: 'saving', error: '', requestId });
      feedback.closeModal();
      const current = () =>
        !disposed && workspace.isCurrent(scope) && store.getState().auth.user?.id === userId;
      try {
        if (!(await workspace.flush())) {
          if (current())
            patch({
              status: 'error',
              error: 'Не удалось сохранить ответы в Supabase. Повторите сохранение черновика.',
            });
          return false;
        }
        if (!current()) return false;
        const task = await repository.save(payload, { userId });
        if (!current()) return false;
        store.update((state) => ({
          ...state,
          published: task.status === 'published',
          taskSave: { status: 'saved', error: '', requestId: task.requestId || requestId, task },
          ownTasks: {
            ...state.ownTasks,
            items: [task, ...state.ownTasks.items.filter((item) => item.id !== task.id)],
          },
        }));
        // Persist the returned ID so reopening the workspace updates the same row.
        await workspace.flush();
        await Promise.all([
          loadMine({ force: true }),
          task.status === 'published' ? catalog.load({ force: true }) : Promise.resolve(),
        ]);
        if (!current()) return true;
        router.render();
        if (task.status === 'published')
          feedback.success(
            'Задача опубликована',
            'Карточка сохранена в Supabase и доступна в каталоге.',
            'Посмотреть задачу',
            `detail?id=${task.id}`,
          );
        else feedback.toast('Черновик сохранён в Supabase');
        return true;
      } catch (error) {
        if (current())
          patch({
            status: 'error',
            error: error.message || 'Не удалось сохранить задачу. Попробуйте снова.',
          });
        return false;
      }
    },
    edit(id) {
      if (store.getState().taskSave.status === 'saving' || !store.getState().workspace.loaded)
        return;
      const task = store.getState().ownTasks.items.find((item) => item.id === Number(id));
      if (!task?.requestId)
        return feedback.toast('Загрузите список своих задач и повторите попытку.');
      workspace.newDraft();
      store.update((state) => ({
        ...state,
        description: task.originalDescription || '',
        taskAnalysis: { ...initialAnalysis(), ...task.analysisSnapshot?.analysis },
        attachmentDraftId: task.analysisSnapshot?.attachments?.draftId || state.attachmentDraftId,
        attachmentSelectedIds: task.analysisSnapshot?.attachments?.selectedIds || [],
        acceptedAttachmentIds: (task.analysisSnapshot?.analysis?.attachmentSources || []).map(
          (item) => item.id,
        ),
        fields: Object.fromEntries(
          Object.entries(fieldLabels).map(([key, label]) => [label, task.card?.[key] || '']),
        ),
        acceptedAnalysis: withMissingInformation(task.card),
        taskMetadata: { industry: task.industry, direction: task.direction, tags: task.tags },
        taskSave: { status: 'idle', error: '', requestId: task.requestId, task },
        rating: task.score,
      }));
      router.navigate('editor');
    },
    dispose() {
      disposed = true;
      reset();
    },
  };
}
