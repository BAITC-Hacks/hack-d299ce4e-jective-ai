import './styles/main.css';
import { readConfig } from './app/config.js';
import { createInitialState } from './app/initial-state.js';
import { createStore } from './app/store.js';
import { createRouter, isAuthCallbackHash } from './app/router.js';
import { bindEvents } from './app/events.js';
import { createFeedback } from './shared/feedback.js';
import { createMotion } from './shared/motion.js';
import { createTasksRepository } from './features/tasks/repository.js';
import { createCatalogController } from './features/tasks/catalog-controller.js';
import { createWorkspaceController } from './features/tasks/workspace-controller.js';
import { createPublicationController } from './features/tasks/publication-controller.js';
import { createTaskAnalysisService } from './services/ai/taskAnalysis.js';
import { workspaceFeedback } from './pages/task-editor.js';
import { createHttpClient } from './shared/api/client.js';
import { createBrowserSupabase } from './shared/supabase.js';
import { createAuthService } from './features/auth/service.js';
import { createAuthController } from './features/auth/controller.js';
import { syncAuthForm } from './features/auth/actions.js';
import { createProposalsRepository } from './features/proposals/repository.js';
import { createProposalsController } from './features/proposals/controller.js';
import { syncProposalForm } from './features/proposals/form.js';
import { createProfilesController } from './features/profiles/controller.js';
import { createProfilesService } from './features/profiles/service.js';
import { createAttachmentsController } from './features/attachments/controller.js';
import { createAttachmentsClient } from './features/attachments/service.js';

const root = document.querySelector('#app');
const config = readConfig();
const confirmationError = new URLSearchParams(window.location.hash.slice(1)).get('error');
const store = createStore(createInitialState());
const feedback = createFeedback({
  overlay: document.querySelector('#overlay'),
  toastElement: document.querySelector('#toast'),
});
const motion = createMotion();
let profiles;
let proposals;
const router = createRouter({
  root,
  store,
  feedback,
  motion,
  onRoute: () => {
    void profiles?.sync();
    const state = store.getState();
    if (['#/proposals', '#/my-proposals', '#/student'].includes(window.location.hash))
      void proposals?.load();
    if (
      state.workspace.loaded &&
      ['#/create', '#/clarify', '#/editor'].includes(window.location.hash)
    )
      void attachments.load();
  },
});
let supabase = null;
try {
  supabase = createBrowserSupabase(config);
} catch {
  console.error('Invalid Supabase public configuration. Check apps/web/.env.local.');
}
const authService = createAuthService({
  supabase,
  apiClient: createHttpClient({ baseUrl: config.apiBaseUrl }),
  redirectUrl: window.location.origin,
});
async function getAccessToken(expectedUserId) {
  const session = await authService.getSession();
  if (!session || (expectedUserId && session.user.id !== expectedUserId))
    throw new Error('Сессия изменилась. Войдите в аккаунт и повторите попытку.');
  return session.access_token;
}
const tasksRepository = createTasksRepository(config, undefined, { getAccessToken });
const proposalsRepository = createProposalsRepository(config, undefined, { getAccessToken });
const scopedAccessToken = (expectedUserId = store.getState().auth.user?.id) =>
  getAccessToken(expectedUserId);
const analysisService = createTaskAnalysisService({ getAccessToken: scopedAccessToken });
profiles = createProfilesController({ store, router, service: createProfilesService(supabase) });
const attachments = createAttachmentsController({
  store,
  service: createAttachmentsClient({ getAccessToken: scopedAccessToken }),
  render: () => {
    if (['#/create', '#/clarify', '#/editor'].includes(window.location.hash)) router.render();
  },
});
let visibleUserId = null;
const authController = createAuthController({
  store,
  service: authService,
  render: () => {
    const userId = store.getState().auth.user?.id || null;
    if (userId !== visibleUserId) {
      feedback.closeModal();
      workspace.reset();
      publication.reset();
      proposals.reset();
      attachments.reset();
      profiles.reset?.();
      visibleUserId = userId;
    }
    if (store.getState().auth.status !== 'authenticated' && syncAuthForm(store.getState().auth))
      return;
    router.render();
    if (store.getState().auth.error && store.getState().auth.status === 'authenticated')
      feedback.toast(store.getState().auth.error);
  },
  onAuthenticated: ({ profile }) => {
    void proposals.load();
    if (profile.role === 'business') {
      void workspace.load().then(() => {
        void workspace.flush();
        if (store.getState().workspace.loaded) void attachments.load();
      });
      void publication.loadMine();
    }
    if (
      !window.location.hash ||
      ['#/', '#/home', '#/login', '#/register'].includes(window.location.hash)
    ) {
      router.navigate(profile.role === 'business' ? 'dashboard' : 'student');
    }
  },
  onSignedOut: () => {
    workspace.reset();
    publication.reset();
    proposals.reset();
    router.navigate('home');
  },
});
const catalog = createCatalogController({
  store,
  repository: tasksRepository,
  render: () => {
    if (
      ['#/catalog', '#/detail', '#/dashboard', '#/my-tasks'].some((route) =>
        window.location.hash.startsWith(route),
      )
    )
      router.render();
  },
});
const workspace = createWorkspaceController({
  store,
  repository: tasksRepository,
  render: () => {
    if (!['#/create', '#/clarify', '#/editor'].includes(window.location.hash)) return;
    const state = store.getState();
    const existing = root.querySelector('[data-workspace-feedback]');
    if (state.workspace.loaded && existing && root.querySelector('.form-card, .editor-card')) {
      existing.outerHTML = workspaceFeedback(state);
      for (const button of root.querySelectorAll('[data-save-task]')) {
        button.disabled = state.taskSave.status === 'saving' || state.workspace.status === 'error';
      }
      return;
    }
    const active = document.activeElement;
    const id = root.contains(active) ? active.id : '';
    const selection =
      id && typeof active.selectionStart === 'number'
        ? [active.selectionStart, active.selectionEnd]
        : null;
    router.render();
    const next = id ? document.getElementById(id) : null;
    next?.focus();
    if (selection && next?.setSelectionRange) next.setSelectionRange(...selection);
  },
});
const publication = createPublicationController({
  store,
  repository: tasksRepository,
  catalog,
  workspace,
  router,
  feedback,
});
proposals = createProposalsController({
  store,
  repository: proposalsRepository,
  router: {
    navigate: router.navigate,
    render: () => {
      if (['#/proposals', '#/my-proposals', '#/student'].includes(window.location.hash))
        router.render();
    },
  },
  feedback,
  renderForm: syncProposalForm,
});
const refreshProposals = () => {
  if (['#/proposals', '#/my-proposals', '#/student'].includes(window.location.hash))
    void proposals.load({ force: true });
};
window.addEventListener('hashchange', refreshProposals);
const unbind = bindEvents({
  store,
  router,
  feedback,
  catalog,
  authController,
  publication,
  workspace,
  service: analysisService,
  attachments,
  profiles,
  proposals,
  getAccessToken: scopedAccessToken,
});

router.start();
void authController.start().finally(() => {
  if (isAuthCallbackHash(window.location.hash) || confirmationError) {
    window.history.replaceState(null, '', '#/login');
    if (confirmationError && store.getState().auth.status !== 'authenticated') {
      store.update((state) => ({
        ...state,
        auth: {
          ...state.auth,
          error:
            'Ссылка подтверждения недействительна или истекла. Попробуйте войти или повторить регистрацию.',
        },
      }));
    }
    router.render();
  }
});
void catalog.load();

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    authController.dispose();
    workspace.dispose();
    publication.dispose();
    proposals.dispose();
    window.removeEventListener('hashchange', refreshProposals);
    supabase?.auth.stopAutoRefresh();
    catalog.dispose();
    attachments.dispose();
    profiles.dispose();
    unbind();
    router.dispose();
    motion.dispose();
    feedback.dispose();
  });
}
