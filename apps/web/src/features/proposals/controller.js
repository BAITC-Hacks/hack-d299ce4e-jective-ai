import { validateProposalWrite, validateProposalDecision } from '@ai-sana/contracts';
import { canProposeSolution } from './permissions.js';
import { emptyProposalForm } from './form.js';

/** Private proposal state is scoped to the verified account, never browser storage. */
export function createProposalsController({
  store,
  repository,
  router,
  feedback,
  renderForm = () => {},
}) {
  let disposed = false;
  let epoch = 0;
  let listVersion = 0;
  let pendingList = null;
  let listOwner = null;
  let formVersion = 0;
  let formOwner = null;

  function identity() {
    const auth = store.getState().auth;
    if (
      auth?.status !== 'authenticated' ||
      !auth.user?.id ||
      auth.profile?.id !== auth.user.id ||
      !['business', 'student'].includes(auth.profile.role)
    )
      return null;
    return { userId: auth.user.id, role: auth.profile.role };
  }
  const key = (owner) => (owner ? `${owner.userId}:${owner.role}` : null);
  // Same-account token refresh retains the last verified identity. Accept an
  // already-started response during that refresh, without enabling new writes.
  const current = (owner, version) => {
    const auth = store.getState().auth;
    return (
      !disposed &&
      epoch === version &&
      ['authenticated', 'initializing'].includes(auth.status) &&
      auth.user?.id === owner.userId &&
      auth.profile?.id === owner.userId &&
      auth.profile?.role === owner.role
    );
  };
  function patchForm(values) {
    store.update((state) => ({ ...state, proposalForm: { ...state.proposalForm, ...values } }));
    renderForm(store.getState());
  }
  function reset() {
    epoch += 1;
    listVersion += 1;
    formVersion += 1;
    pendingList = null;
    listOwner = null;
    formOwner = null;
    store.update((state) => ({
      ...state,
      proposals: { items: [], status: 'idle', error: '' },
      proposalForm: emptyProposalForm(),
      proposalDecision: { id: null, status: 'idle', error: '' },
    }));
  }
  function load({ force = false } = {}) {
    const owner = identity();
    if (disposed || !owner) return Promise.resolve();
    // Keep the target card/error visible until its decision request settles.
    if (store.getState().proposalDecision.status === 'saving') return Promise.resolve();
    if (listOwner === key(owner) && pendingList) return pendingList;
    if (
      !force &&
      listOwner === key(owner) &&
      ['ready', 'error'].includes(store.getState().proposals.status)
    )
      return Promise.resolve();
    listOwner = key(owner);
    const version = ++listVersion;
    const generation = epoch;
    const isCurrent = () => current(owner, generation) && version === listVersion;
    store.update((state) => ({ ...state, proposals: { items: [], status: 'loading', error: '' } }));
    pendingList = Promise.resolve()
      .then(() => repository.list({ userId: owner.userId }))
      .then((items) => {
        if (isCurrent())
          store.update((state) => ({
            ...state,
            proposals: { items, status: 'ready', error: '' },
            proposalDecision:
              state.proposalDecision.status === 'error'
                ? { id: null, status: 'idle', error: '' }
                : state.proposalDecision,
          }));
      })
      .catch((error) => {
        if (isCurrent())
          store.update((state) => ({
            ...state,
            proposals: {
              items: [],
              status: 'error',
              error: error.message || 'Не удалось загрузить отклики.',
            },
          }));
      })
      .finally(() => {
        if (version === listVersion) pendingList = null;
        if (isCurrent()) router.render();
      });
    // Route rendering may request this same list again; install the in-flight
    // promise first so render -> onRoute -> load cannot recurse indefinitely.
    router.render();
    return pendingList;
  }
  return {
    load,
    reset,
    open(taskId) {
      if (disposed || !canProposeSolution(store.getState().auth)) return false;
      if (store.getState().proposalForm.status === 'saving') return false;
      const task = store.getState().catalog.items.find((item) => item.id === taskId);
      if (!task || !Number.isSafeInteger(taskId) || taskId < 1) {
        feedback.toast('Откройте опубликованную задачу в каталоге.');
        return false;
      }
      if (store.getState().proposals.items.some((item) => item.taskId === taskId)) {
        feedback.toast('Вы уже отправили отклик на эту задачу.');
        router.navigate('my-proposals');
        return false;
      }
      formVersion += 1;
      formOwner = key(identity());
      store.update((state) => ({ ...state, proposalForm: { ...emptyProposalForm(), taskId } }));
      return true;
    },
    async submit(values) {
      const owner = identity();
      const form = store.getState().proposalForm;
      if (disposed || !canProposeSolution(store.getState().auth) || formOwner !== key(owner))
        return false;
      if (form.status === 'saving') return false;
      let payload;
      try {
        payload = validateProposalWrite({
          ...values,
          taskId: form.taskId,
          prototypeUrl: values?.prototypeUrl?.trim() || null,
        });
      } catch (error) {
        patchForm({ status: 'error', error: error.message });
        return false;
      }
      const generation = epoch;
      const version = formVersion;
      const isCurrent = () => current(owner, generation) && formVersion === version;
      patchForm({
        status: 'saving',
        error: '',
        values: {
          teamName: payload.teamName,
          idea: payload.idea,
          plan: payload.plan,
          deadline: payload.deadline,
          prototypeUrl: payload.prototypeUrl || '',
        },
      });
      try {
        const proposal = await repository.submit(payload, { userId: owner.userId });
        if (!isCurrent()) return false;
        // Ignore a list response started before submission, which could omit the new row.
        listVersion += 1;
        pendingList = null;
        listOwner = key(owner);
        store.update((state) => ({
          ...state,
          proposals: {
            items: [proposal, ...state.proposals.items.filter((item) => item.id !== proposal.id)],
            status: 'ready',
            error: '',
          },
          proposalForm: emptyProposalForm(),
        }));
        formOwner = null;
        router.render();
        feedback.success(
          'Предложение отправлено',
          'Отклик сохранён. Владелец задачи увидит все заполненные поля в разделе «Отклики».',
          'Мои отклики',
          'my-proposals',
        );
        void load({ force: true });
        return true;
      } catch (error) {
        if (isCurrent())
          patchForm({
            status: 'error',
            error: error.message || 'Не удалось отправить отклик. Попробуйте ещё раз.',
          });
        return false;
      }
    },
    async decide(id, status) {
      const owner = identity();
      if (disposed || !owner || owner.role !== 'business') return false;
      const state = store.getState();
      if (state.proposalDecision.status === 'saving' || state.proposals.status !== 'ready')
        return false;
      const existing = state.proposals.items.find((item) => item.id === id);
      if (!existing) {
        feedback.toast('Обновите список откликов и повторите попытку.');
        return false;
      }
      let payload;
      try {
        payload = validateProposalDecision({ status, expectedStatus: existing.status });
      } catch (error) {
        feedback.toast(error.message);
        return false;
      }
      if (existing.status === payload.status) return true;
      const generation = epoch;
      // Invalidate a list started before this mutation, so stale data cannot win.
      listVersion += 1;
      pendingList = null;
      store.update((state) => ({
        ...state,
        proposalDecision: { id, status: 'saving', error: '' },
      }));
      router.render();
      try {
        const proposal = await repository.decide(id, payload, { userId: owner.userId });
        if (!current(owner, generation)) return false;
        if (
          proposal.id !== existing.id ||
          proposal.taskId !== existing.taskId ||
          proposal.status !== payload.status
        )
          throw new Error('Сервер вернул некорректный результат решения. Обновите отклики.');
        listVersion += 1;
        pendingList = null;
        store.update((state) => ({
          ...state,
          proposals: {
            ...state.proposals,
            items: state.proposals.items.map((item) => (item.id === id ? proposal : item)),
          },
          proposalDecision: { id: null, status: 'idle', error: '' },
        }));
        router.render();
        feedback.toast(payload.status === 'accepted' ? 'Отклик принят' : 'Отклик отклонён');
        return true;
      } catch (error) {
        if (!current(owner, generation)) return false;
        store.update((state) => ({
          ...state,
          proposalDecision: {
            id,
            status: 'error',
            error: error.message || 'Не удалось сохранить решение. Попробуйте ещё раз.',
          },
        }));
        router.render();
        if (error.code === 'PROPOSAL_DECISION_CONFLICT') {
          await load({ force: true });
          if (current(owner, generation)) feedback.toast(error.message);
        }
        return false;
      }
    },
    dispose() {
      disposed = true;
      reset();
    },
  };
}
