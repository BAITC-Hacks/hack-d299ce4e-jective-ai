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
import { createHttpClient } from './shared/api/client.js';
import { createBrowserSupabase } from './shared/supabase.js';
import { createAuthService } from './features/auth/service.js';
import { createAuthController } from './features/auth/controller.js';
import { syncAuthForm } from './features/auth/actions.js';
import './styles/auth.css';
import './styles/attachments.css';
import { createAttachmentsClient } from './features/attachments/service.js';
import { createAttachmentsController } from './features/attachments/controller.js';

const root = document.querySelector('#app');
const config = readConfig();
const confirmationError = new URLSearchParams(window.location.hash.slice(1)).get('error');
const store = createStore(createInitialState());
const feedback = createFeedback({
  overlay: document.querySelector('#overlay'),
  toastElement: document.querySelector('#toast'),
});
const motion = createMotion();
const router = createRouter({ root, store, feedback, motion });
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
  onSignedOut: () => router.navigate('home'),
});
const catalog = createCatalogController({
  store,
  repository: createTasksRepository(config),
  render: () => {
    if (['#/catalog', '#/detail'].some((route) => window.location.hash.startsWith(route)))
      router.render();
  },
});
const unbind = bindEvents({
  store,
  router,
  feedback,
  catalog,
  authController,
  attachments,
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
    supabase?.auth.stopAutoRefresh();
    catalog.dispose();
    attachments.dispose();
    unbind();
    router.dispose();
    motion.dispose();
    feedback.dispose();
  });
}
