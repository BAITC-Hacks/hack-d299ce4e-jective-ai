import { createTaskActions } from '../features/tasks/actions.js';
import { createProposalActions } from '../features/proposals/actions.js';
import { createAuthActions } from '../features/auth/actions.js';

/** One delegated event layer; feature modules own business actions. */
export function bindEvents(context) {
  const { store, router, feedback } = context;
  const tasks = createTaskActions(context);
  const auth = createAuthActions(context);
  const actions = {
    ...tasks.actions,
    ...createProposalActions(context),
    forgot: auth.forgot,
    close: feedback.closeModal,
  };
  const controller = new AbortController();
  const listen = (type, handler) =>
    document.addEventListener(type, handler, { signal: controller.signal });

  function dispatch(name) {
    if (Object.hasOwn(actions, name)) actions[name]();
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
      document
        .querySelectorAll('.role')
        .forEach((item) => item.classList.toggle('selected', item.dataset.role === role));
      return;
    }
    if (route) return router.navigate(route);
    if (action) dispatch(action);
  });

  listen('submit', (event) => {
    if (['login-form', 'register-form'].includes(event.target.id)) {
      event.preventDefault();
      auth.signIn();
    } else if (event.target.id === 'offer-form') {
      event.preventDefault();
      dispatch('offer-success');
    }
  });

  listen('input', (event) => {
    const input = event.target;
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
