import { createAnalysisController } from '../features/tasks/analysis-controller.js';
import { createScoringController } from '../features/tasks/scoring-controller.js';
import { missingFeedback } from '../pages/task-editor.js';
import { createTaskActions } from '../features/tasks/actions.js';
import { createProposalActions } from '../features/proposals/actions.js';
import { createAuthActions } from '../features/auth/actions.js';

/** One delegated event layer; feature modules own business actions. */
export function bindEvents(context) {
  const { store, router, feedback, publication, workspace } = context;
  const scoring = createScoringController(context);
  const tasks = createTaskActions({ ...context, scoring });
  const analysis = createAnalysisController({ ...context, scoring });
  const auth = createAuthActions(context);
  const actions = {
    ...tasks.actions,
    ...analysis.actions,
    'score-task': () => scoring.score(),
    ...createProposalActions(context),
    forgot: auth.forgot,
    logout: auth.logout,
    'force-logout': auth.forceLogout,
    'retry-auth': auth.retry,
    close: feedback.closeModal,
  };
  const controller = new AbortController();
  const listen = (type, handler) =>
    document.addEventListener(type, handler, { signal: controller.signal });
  window.addEventListener(
    'beforeunload',
    (event) => {
      if (!workspace.hasUnsaved()) return;
      event.preventDefault();
      event.returnValue = '';
    },
    { signal: controller.signal },
  );
  listen('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void workspace.flush();
  });

  function dispatch(name, taskId, values) {
    const publicActions = ['forgot', 'close', 'logout', 'retry-auth', 'retry-catalog'];
    if (
      Object.hasOwn(actions, name) &&
      !publicActions.includes(name) &&
      store.getState().auth.status !== 'authenticated'
    ) {
      router.navigate('login');
      return;
    }
    if (name === 'edit-task') return publication.edit(taskId);
    if (Object.hasOwn(actions, name)) actions[name](values);
    else router.navigate(name);
  }

  listen('click', (event) => {
    const element = event.target.closest(
      '[data-action],[data-route],[data-role],[data-edit],[data-close],[data-scroll]',
    );
    if (!element) return;
    const { action, route, role, edit, close, scroll } = element.dataset;
    if (close && event.target === element) return feedback.closeModal();
    if (scroll) {
      document.getElementById(scroll)?.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'start',
      });
      return;
    }
    if (edit) return tasks.editField(edit);
    if (role && ['business', 'student'].includes(role)) {
      store.update((state) => ({ ...state, role }));
      document.querySelectorAll('.role').forEach((item) => {
        const selected = item.dataset.role === role;
        item.classList.toggle('selected', selected);
        item.setAttribute('aria-pressed', String(selected));
      });
      return;
    }
    if ((route || action) === 'create' && store.getState().taskSave.task) {
      if (!workspace.newDraft()) return;
    }
    if (route) return router.navigate(route);
    if (action) dispatch(action, element.dataset.taskId, element.dataset.proposalId);
  });

  listen('submit', (event) => {
    if (['login-form', 'register-form'].includes(event.target.id)) {
      event.preventDefault();
      void auth.submit(event.target);
    } else if (event.target.id === 'offer-form') {
      event.preventDefault();
      dispatch('offer-success', undefined, Object.fromEntries(new FormData(event.target)));
    }
  });

  listen('input', (event) => {
    const input = event.target;
    const meta = input.dataset.taskMeta;
    if (['industry', 'direction', 'tags'].includes(meta)) {
      store.update((state) => ({
        ...state,
        taskMetadata: {
          ...state.taskMetadata,
          [meta]:
            meta === 'tags'
              ? [
                  ...new Set(
                    input.value
                      .split(',')
                      .map((tag) => tag.trim())
                      .filter(Boolean),
                  ),
                ]
              : input.value,
        },
      }));
    }
    if (input.dataset.analysisAnswer !== undefined)
      analysis.setAnswer(input.dataset.analysisAnswer, input.value);
    if (input.dataset.analysisField !== undefined) {
      analysis.setResultField(input.dataset.analysisField, input.value);
      const feedback = document.querySelector('#analysis-missing');
      if (feedback)
        feedback.innerHTML = missingFeedback(store.getState().taskAnalysis.analysisResult);
    }
    if (input.dataset.answer !== undefined) {
      store.update((state) => ({
        ...state,
        answers: { ...state.answers, [input.dataset.answer]: input.value },
      }));
    }
    if (input.id === 'description')
      store.update((state) => ({ ...state, description: input.value }));
    if (input.id === 'search') {
      const start = input.selectionStart;
      const end = input.selectionEnd;
      store.update((state) => ({ ...state, filters: { ...state.filters, search: input.value } }));
      router.render();
      const next = document.querySelector('#search');
      next?.focus();
      next?.setSelectionRange(start, end);
    }
  });

  listen('change', (event) => {
    const filter = event.target.dataset.filter;
    if (!['industry', 'direction', 'level', 'sort'].includes(filter)) return;
    store.update((state) => ({
      ...state,
      filters: { ...state.filters, [filter]: event.target.value },
    }));
    router.render();
  });
  listen('keydown', (event) => {
    if (event.key === 'Escape') feedback.closeModal();
  });

  return () => controller.abort();
}
