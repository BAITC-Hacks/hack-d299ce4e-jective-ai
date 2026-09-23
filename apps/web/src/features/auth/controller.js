import { createInitialState } from '../../app/initial-state.js';
import { authErrorMessage } from './errors.js';

/** Supabase owns tokens; the app stores only identity confirmed by our backend. */
export function createAuthController({
  store,
  service,
  render,
  onAuthenticated = () => {},
  onSignedOut = () => {},
}) {
  let disposed = false;
  let revision = 0;
  let sessionEpoch = 0;
  let verifiedUserId;
  let activeToken;
  let pending;
  let unsubscribe = () => {};
  const timers = new Set();

  function patch(values) {
    if (disposed) return;
    store.update((state) => ({ ...state, auth: { ...state.auth, ...values } }));
    render();
  }

  function clearIdentity({ notice = '', notify = false } = {}) {
    revision += 1;
    activeToken = undefined;
    pending = undefined;
    verifiedUserId = undefined;
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
    if (disposed) return;
    store.update((state) => ({
      ...createInitialState(),
      catalog: state.catalog,
      role: state.role,
      auth: {
        ...createInitialState().auth,
        configured: service.configured,
        status: 'anonymous',
        notice,
      },
    }));
    render();
    if (notify) onSignedOut();
  }

  function applySession(session) {
    if (disposed) return Promise.resolve(false);
    if (!session?.access_token) {
      clearIdentity();
      return Promise.resolve(false);
    }
    if (activeToken === session.access_token) {
      if (pending) return pending;
      if (store.getState().auth.status === 'authenticated') return Promise.resolve(true);
    }
    const current = ++revision;
    activeToken = session.access_token;
    // Retain the last verified identity during a same-account token refresh. Private
    // routes remain gated by status; in-flight saves retain their account scope.
    const previous = store.getState().auth;
    const sameAccount = verifiedUserId && session.user?.id === verifiedUserId;
    patch({
      status: 'initializing',
      user: sameAccount ? previous.user : null,
      profile: sameAccount ? previous.profile : null,
      error: '',
    });
    const request = service
      .getIdentity(session.access_token)
      .then((identity) => {
        if (disposed || current !== revision) return false;
        store.update((state) => ({
          ...(verifiedUserId && verifiedUserId !== identity.user.id ? createInitialState() : state),
          catalog: state.catalog,
          role: identity.profile.role,
          auth: { ...state.auth, ...identity, status: 'authenticated', error: '', notice: '' },
        }));
        verifiedUserId = identity.user.id;
        render();
        onAuthenticated(identity);
        return true;
      })
      .catch((error) => {
        if (!disposed && current === revision) {
          patch({ status: 'error', user: null, profile: null, error: authErrorMessage(error) });
        }
        return false;
      })
      .finally(() => {
        if (current === revision) pending = undefined;
      });
    pending = request;
    return request;
  }

  async function restore() {
    const current = revision;
    try {
      const session = await service.getSession();
      if (disposed || current !== revision) return false;
      return await applySession(session);
    } catch (error) {
      if (disposed || current !== revision) return false;
      patch({ status: 'error', user: null, profile: null, error: authErrorMessage(error) });
      return false;
    }
  }

  async function submit(kind, values) {
    if (disposed || store.getState().auth.busy) return false;
    if (!service.configured) {
      patch({ error: 'Регистрация и вход временно недоступны.' });
      return false;
    }
    const name = values.fullName?.trim();
    if (
      kind === 'register' &&
      (!name || name.length > 120 || !['business', 'student'].includes(values.role))
    ) {
      patch({ error: 'Введите имя от 1 до 120 символов и выберите роль.' });
      return false;
    }
    if (
      !values.email?.trim() ||
      typeof values.password !== 'string' ||
      values.password.length < 6
    ) {
      patch({ error: 'Введите email и пароль длиной не менее 6 символов.' });
      return false;
    }
    const epoch = sessionEpoch;
    patch({ busy: true, error: '', notice: '' });
    try {
      const data = await service[kind](values);
      if (disposed || epoch !== sessionEpoch) return false;
      if (kind === 'register' && !data.session) {
        clearIdentity({
          notice:
            'Проверьте почту: для завершения регистрации перейдите по ссылке в письме. Если аккаунт уже существует, используйте вход.',
        });
        return true;
      }
      if (!data.session) throw new Error('No session returned.');
      return await applySession(data.session);
    } catch (error) {
      if (epoch === sessionEpoch) patch({ error: authErrorMessage(error) });
      return false;
    } finally {
      if (epoch === sessionEpoch) patch({ busy: false });
    }
  }

  return {
    register: (values) => submit('register', values),
    login: (values) => submit('login', values),
    retry: restore,
    async logout() {
      if (store.getState().auth.busy) return;
      sessionEpoch += 1;
      patch({ busy: true, error: '' });
      try {
        await service.logout();
        clearIdentity({ notify: true });
      } catch (error) {
        patch({ error: authErrorMessage(error) });
      } finally {
        patch({ busy: false });
      }
    },
    async start() {
      patch({ configured: service.configured });
      unsubscribe = service.subscribe((event, session) => {
        if (disposed) return;
        // Never await Supabase methods from inside its auth callback/lock.
        if (event === 'SIGNED_OUT') {
          sessionEpoch += 1;
          clearIdentity({ notify: true });
          return;
        }
        const epoch = sessionEpoch;
        const timer = setTimeout(() => {
          timers.delete(timer);
          if (epoch === sessionEpoch) void applySession(session);
        }, 0);
        timers.add(timer);
      });
      return restore();
    },
    dispose() {
      disposed = true;
      revision += 1;
      unsubscribe();
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
    },
  };
}
