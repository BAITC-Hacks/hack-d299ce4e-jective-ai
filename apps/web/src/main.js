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
    void proposals?.sync();
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
const getAccessToken = async () => (await authService.getSession())?.access_token;
profiles = createProfilesController({ store, router, service: createProfilesService(supabase) });
const attachments = createAttachmentsController({
  store,
  service: createAttachmentsClient({ getAccessToken }),
  render: () => {
    if (['#/create', '#/clarify', '#/editor'].includes(window.location.hash)) router.render();
  },
});
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
      visibleUserId = userId;
    }
    if (store.getState().auth.status !== 'authenticated' && syncAuthForm(store.getState().auth))
      return;
    router.render();
    if (store.getState().auth.error && store.getState().auth.status === 'authenticated')
      feedback.toast(store.getState().auth.error);
  },
  onAuthenticated: ({ profile }) => {
    if (profile.role === 'business') void attachments.load();
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
  repository: {
    async list() {
      if (!supabase) return createTasksRepository(config).list();
      return createProposalsService(supabase).tasks();
    },
  },
  render: () => {
    if (
      ['#/catalog', '#/detail', '#/dashboard', '#/my-tasks'].some((route) =>
        window.location.hash.startsWith(route),
      )
    )
      router.render();
  },
});
proposals = createProposalsController({
  store,
  router,
  feedback,
  service: createProposalsService(supabase),
  reloadCatalog: () => catalog.load(),
});
const unbind = bindEvents({
  store,
  router,
  feedback,
  catalog,
  authController,
  attachments,
  profiles,
  proposals,
  getAccessToken,
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
    proposals.dispose();
    unbind();
    router.dispose();
    motion.dispose();
    feedback.dispose();
  });
}
