import { fieldLabels, initialAnalysis, withMissingInformation } from '../../services/ai/types.js';
import { createInitialState } from '../../app/initial-state.js';

export function taskCard(state) {
  return Object.fromEntries(
    Object.entries(fieldLabels).map(([key, label]) => {
      const value = state.fields[label]?.trim();
      return [key, value && value !== 'Не указано' ? value : null];
    }),
  );
}
export function workspaceSnapshot(state) {
  const flow = state.taskAnalysis || initialAnalysis();
  const step =
    flow.step === 'result'
      ? 'result'
      : ['questions', 'generating'].includes(flow.step) ||
          (flow.step === 'error' && flow.retry === 'generating')
        ? 'questions'
        : 'description';
  return {
    version: 1,
    description: state.description,
    analysis: {
      step,
      originalDescription: flow.originalDescription,
      questions: flow.questions,
      answers: flow.answers,
      currentQuestion: flow.currentQuestion,
      analysisResult: flow.analysisResult,
      knownInformation: flow.knownInformation,
      missingInformation: flow.missingInformation,
    },
    card:
      state.acceptedAnalysis || Object.values(taskCard(state)).some(Boolean)
        ? taskCard(state)
        : null,
    metadata: state.taskMetadata,
    requestId: state.taskSave.requestId,
    taskId: state.taskSave.task?.id ?? null,
    score: state.rating,
    scoringResult: state.aiScoring?.status === 'ready' ? state.aiScoring.result : null,
  };
}

/** Only this explicit private snapshot is persisted — never auth, tokens or the public cache. */
export function createWorkspaceController({ store, repository, render, delayMs = 600 }) {
  let owner;
  let generation = 0;
  let timer;
  let pending;
  let loading;
  let disposed = false;
  let lastSaved = '';
  let lastObserved = '';
  const scope = () => `${owner ?? ''}:${generation}`;
  const current = (requestScope) =>
    !disposed && scope() === requestScope && owner === store.getState().auth.user?.id;
  const update = (values) => {
    store.update((state) => ({ ...state, workspace: { ...state.workspace, ...values } }));
    render();
  };
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      void flush();
    }, delayMs);
  }
  const unsubscribe = store.subscribe((state) => {
    if (disposed || !owner || state.auth.user?.id !== owner || !state.workspace.loaded) return;
    const serialized = JSON.stringify(workspaceSnapshot(state));
    if (serialized === lastObserved) return;
    lastObserved = serialized;
    schedule();
  });
  async function flush() {
    clearTimeout(timer);
    const requestScope = scope();
    if (!current(requestScope) || !store.getState().workspace.loaded) return false;
    if (pending) {
      await pending;
      return current(requestScope) ? flush() : false;
    }
    const snapshot = workspaceSnapshot(store.getState());
    const serialized = JSON.stringify(snapshot);
    if (serialized === lastSaved) return true;
    const userId = owner;
    update({ status: 'saving', error: '' });
    pending = Promise.resolve()
      .then(() => repository.saveWorkspace(snapshot, { userId }))
      .then(() => {
        if (!current(requestScope)) return false;
        lastSaved = serialized;
        update({ status: 'ready', error: '' });
        return true;
      })
      .catch((error) => {
        if (current(requestScope))
          update({
            status: 'error',
            error: error.message || 'Не удалось сохранить черновик в Supabase.',
          });
        return false;
      });
    const request = pending;
    const success = await request;
    if (pending === request) pending = undefined;
    if (
      success &&
      current(requestScope) &&
      JSON.stringify(workspaceSnapshot(store.getState())) !== lastSaved
    )
      return flush();
    return success;
  }
  function reset() {
    generation += 1;
    owner = undefined;
    loading = undefined;
    lastSaved = '';
    lastObserved = '';
    clearTimeout(timer);
  }
  return {
    flush,
    hasUnsaved: () =>
      Boolean(
        owner &&
        store.getState().workspace.loaded &&
        (pending || JSON.stringify(workspaceSnapshot(store.getState())) !== lastSaved),
      ),
    scope,
    isCurrent: current,
    async load({ force = false } = {}) {
      const user = store.getState().auth;
      if (user.status !== 'authenticated' || user.profile?.role !== 'business') return;
      if (owner === user.user.id && !force) {
        if (loading) return loading;
        if (store.getState().workspace.loaded) return;
      }
      generation += 1;
      owner = user.user.id;
      const userId = owner;
      const requestScope = scope();
      clearTimeout(timer);
      update({ status: 'loading', error: '', loaded: false });
      loading = Promise.resolve(pending)
        .then(() => repository.loadWorkspace({ userId }))
        .then((snapshot) => {
          if (!current(requestScope)) return;
          if (snapshot)
            store.update((state) => ({
              ...state,
              description: snapshot.description,
              taskAnalysis: { ...initialAnalysis(), ...snapshot.analysis },
              acceptedAnalysis: snapshot.card ? withMissingInformation(snapshot.card) : null,
              fields: Object.fromEntries(
                Object.entries(fieldLabels).map(([key, label]) => [
                  label,
                  snapshot.card?.[key] || '',
                ]),
              ),
              taskMetadata: snapshot.metadata,
              taskSave: {
                status: 'idle',
                error: '',
                requestId: snapshot.requestId,
                task:
                  state.ownTasks.items.find((task) => task.id === snapshot.taskId) ||
                  (snapshot.taskId ? { id: snapshot.taskId } : null),
              },
              rating: snapshot.score,
              aiScoring: snapshot.scoringResult
                ? { status: 'ready', result: snapshot.scoringResult, error: '' }
                : { status: 'idle', result: null, error: '' },
            }));
          lastSaved = lastObserved = JSON.stringify(workspaceSnapshot(store.getState()));
          update({ status: 'ready', error: '', loaded: true });
        })
        .catch((error) => {
          if (current(requestScope))
            update({ status: 'error', error: error.message || 'Не удалось загрузить черновик.' });
        })
        .finally(() => {
          if (current(requestScope)) loading = undefined;
        });
      return loading;
    },
    reset,
    newDraft() {
      if (!store.getState().workspace.loaded || store.getState().taskSave.status === 'saving')
        return false;
      generation += 1;
      const blank = createInitialState();
      store.update((state) => ({
        ...state,
        description: '',
        taskAnalysis: initialAnalysis(),
        acceptedAnalysis: null,
        fields: blank.fields,
        taskSave: blank.taskSave,
        taskMetadata: blank.taskMetadata,
        rating: null,
        aiScoring: null,
        published: false,
      }));
      return true;
    },
    retry() {
      return store.getState().workspace.loaded ? flush() : this.load({ force: true });
    },
    dispose() {
      disposed = true;
      reset();
      unsubscribe();
    },
  };
}
