import * as pages from '../pages/index.js';
import { pageTitle } from '../components/layout.js';

export function parseRoute(hash) {
  const [path, query = ''] = hash.replace(/^#\/?/, '').split('?');
  const params = new URLSearchParams(query);
  return { name: path || 'home', taskId: params.has('id') ? Number(params.get('id')) : 2 };
}

const routes = {
  home: pages.landing,
  login: (state) => pages.auth(state, false),
  register: (state) => pages.auth(state, true),
  dashboard: pages.dashboard,
  'my-tasks': pages.myTasks,
  create: pages.create,
  clarify: pages.clarify,
  editor: pages.editor,
  catalog: pages.catalog,
  detail: pages.detail,
  student: pages.student,
  'my-proposals': pages.myProposals,
  proposals: pages.proposals,
  team: (state) => pages.simple(state, 'team'),
  profile: (state) => pages.simple(state, 'profile'),
};

export function createRouter({ root, store, feedback, motion }) {
  function render({ scrollToTop = false } = {}) {
    const route = parseRoute(window.location.hash);
    const name = Object.hasOwn(routes, route.name) ? route.name : 'home';
    if (name === 'detail') {
      store.update((state) => ({
        ...state,
        currentTaskId: route.taskId,
        saved: state.savedTaskIds.includes(route.taskId),
      }));
    }
    root.innerHTML = routes[name](store.getState());
    document.title =
      name === 'home' ? 'AI Sana — реальные задачи, реальный опыт' : `${pageTitle(name)} — AI Sana`;
    if (scrollToTop) window.scrollTo(0, 0);
    motion.init(root);
  }

  function onHashChange() {
    feedback.closeModal();
    render({ scrollToTop: true });
  }

  return {
    render,
    navigate(target) {
      const hash = `#/${target}`;
      if (window.location.hash === hash) onHashChange();
      else window.location.hash = hash;
    },
    start() {
      window.addEventListener('hashchange', onHashChange);
      render();
    },
    dispose() {
      window.removeEventListener('hashchange', onHashChange);
    },
  };
}
