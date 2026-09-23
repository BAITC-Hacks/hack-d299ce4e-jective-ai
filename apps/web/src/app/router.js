import * as pages from '../pages/index.js';
import { pageTitle } from '../components/layout.js';
import { profilePage, membersPage } from '../pages/profile.js';

/** Keep confirmation tokens intact until the Supabase SDK has consumed the callback. */
export function isAuthCallbackHash(hash) {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  return ['access_token', 'refresh_token', 'error', 'error_description', 'error_code'].some((key) =>
    params.has(key),
  );
}

export function parseRoute(hash) {
  const [path, query = ''] = hash.replace(/^#\/?/, '').split('?');
  const params = new URLSearchParams(query);
  return { name: path || 'home', taskId: params.has('id') ? Number(params.get('id')) : null };
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
  profile: profilePage,
  members: membersPage,
};

export function createRouter({ root, store, feedback, motion, onRoute = () => {} }) {
  let pendingProfile = null;
  function render({ scrollToTop = false } = {}) {
    if (isAuthCallbackHash(window.location.hash)) {
      root.innerHTML = '<div class="auth-loading" role="status">Подтверждаем вход…</div>';
      return;
    }
    const route = parseRoute(window.location.hash);
    let name = Object.hasOwn(routes, route.name) ? route.name : 'home';
    const auth = store.getState().auth;
    const privatePages = [
      'dashboard',
      'my-tasks',
      'create',
      'clarify',
      'editor',
      'proposals',
      'student',
      'my-proposals',
      'profile',
      'members',
    ];
    const businessPages = ['dashboard', 'my-tasks', 'create', 'clarify', 'editor', 'proposals'];
    const studentPages = ['student', 'my-proposals'];
    if (privatePages.includes(name) && auth.status === 'initializing') {
      root.innerHTML = '<div class="auth-loading" role="status">Проверяем вход…</div>';
      document.title = 'Вход — AI Sana';
      return;
    }
    if (privatePages.includes(name) && auth.status !== 'authenticated') {
      if (name === 'profile' && window.location.hash.includes('?user='))
        pendingProfile = window.location.hash;
      name = 'login';
    }
    if (auth.status === 'authenticated') {
      if (pendingProfile && ['login', 'register'].includes(name)) {
        const target = pendingProfile;
        pendingProfile = null;
        if (window.history?.replaceState) window.history.replaceState(null, '', target);
        else window.location.hash = target;
        render({ scrollToTop });
        return;
      }
      const home = auth.profile.role === 'business' ? 'dashboard' : 'student';
      if (
        ['login', 'register'].includes(name) ||
        (businessPages.includes(name) && auth.profile.role !== 'business') ||
        (studentPages.includes(name) && auth.profile.role !== 'student')
      )
        name = home;
    }
    if (name !== route.name && route.name !== 'home') {
      if (window.history?.replaceState) window.history.replaceState(null, '', `#/${name}`);
      else window.location.hash = `#/${name}`;
    }
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
    onRoute();
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
