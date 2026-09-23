import { isUuid } from '@ai-sana/contracts/attachments';
import { prepareAvatar, profileFields, socialFields } from './service.js';

export function createProfilesController({ store, router, service, prepare = prepareAvatar }) {
  let currentKey = '';
  let revision = 0;
  let disposed = false;
  const patch = (values) =>
    store.update((s) => ({ ...s, profilePage: { ...s.profilePage, ...values } }));
  const render = () => router.render();
  function route() {
    const [path, query] = window.location.hash.split('?');
    const owner = store.getState().auth.user?.id;
    return { path, owner, id: new URLSearchParams(query).get('user') || owner };
  }
  async function sync(force = false) {
    const { path, owner, id } = route();
    const key = `${owner}:${path}:${id}`;
    if (!force && key === currentKey) return;
    currentKey = key;
    const request = ++revision;
    if (disposed || !owner || !['#/profile', '#/members'].includes(path)) return;
    const previous = store.getState().profilePage;
    const directory = path === '#/members';
    patch({
      status: 'loading',
      error: '',
      notice: '',
      profile: null,
      members: [],
      editing: false,
      draft: null,
      busy: false,
      query: force ? previous?.query || '' : '',
      page: force ? previous?.page || 0 : 0,
    });
    render();
    try {
      if (!directory && !isUuid(id)) throw new Error('Некорректная ссылка на профиль.');
      const state = store.getState().profilePage;
      const result = directory
        ? await service.list(state.query, state.page)
        : await service.get(id);
      if (disposed || request !== revision || route().owner !== owner) return;
      patch({ status: 'ready', ...(directory ? { members: result } : { profile: result }) });
    } catch (error) {
      if (disposed || request !== revision || route().owner !== owner) return;
      patch({ status: 'error', error: error.message });
    }
    render();
  }
  function capture(form) {
    if (!form) return;
    const values = Object.fromEntries(new FormData(form));
    const draft = Object.fromEntries(
      Object.keys(profileFields).map((key) => [key, values[key] || '']),
    );
    draft.social_links = Object.fromEntries(
      Object.keys(socialFields).map((key) => [key, values[key] || '']),
    );
    patch({ draft });
  }
  async function mutate(operation, notice, closeEditor = false) {
    const state = store.getState();
    const owner = state.auth.user?.id;
    if (!owner || state.profilePage?.profile?.id !== owner || state.profilePage.busy) return;
    const request = revision;
    patch({ busy: true, error: '', notice: '' });
    render();
    try {
      const profile = await operation(owner, state.profilePage.profile);
      if (disposed || request !== revision || route().owner !== owner) return;
      patch({ profile, notice, ...(closeEditor ? { editing: false, draft: null } : {}) });
      store.update((s) => ({
        ...s,
        auth: { ...s.auth, profile: { ...s.auth.profile, full_name: profile.full_name } },
      }));
    } catch (error) {
      if (disposed || request !== revision || route().owner !== owner) return;
      patch({ error: error.message });
    } finally {
      if (!disposed && request === revision && route().owner === owner) {
        patch({ busy: false });
        render();
      }
    }
  }
  return {
    sync,
    capture,
    save(form) {
      capture(form);
      const draft = store.getState().profilePage.draft;
      return mutate((id) => service.save(id, draft), 'Профиль сохранён.', true);
    },
    upload(file) {
      if (file)
        return mutate(
          async (id, profile) => service.avatar(id, await prepare(file), profile.avatar_path),
          'Фото обновлено.',
        );
    },
    search(form) {
      patch({ query: new FormData(form).get('query') || '', page: 0 });
      return sync(true);
    },
    actions: {
      'profile-edit': () => {
        const data = store.getState().profilePage;
        if (!data?.profile || data.busy) return;
        patch({ editing: true, draft: data.draft || structuredClone(data.profile), notice: '' });
        render();
        document
          .querySelector('#profile-form')
          ?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      },
      'profile-cancel': () => {
        patch({ editing: false, draft: null, error: '' });
        render();
      },
      'profile-remove-avatar': () =>
        mutate((id, profile) => service.avatar(id, null, profile.avatar_path), 'Фото удалено.'),
      'profile-retry': () => sync(true),
      'members-next': () => {
        patch({ page: (store.getState().profilePage.page || 0) + 1 });
        void sync(true);
      },
      'members-prev': () => {
        patch({ page: Math.max(0, (store.getState().profilePage.page || 0) - 1) });
        void sync(true);
      },
      'profile-share': async () => {
        const id = store.getState().profilePage?.profile?.id;
        if (!id) return;
        const url = `${window.location.origin}${window.location.pathname}#/profile?user=${id}`;
        try {
          await navigator.clipboard.writeText(url);
          patch({ notice: 'Ссылка скопирована.' });
        } catch {
          patch({ notice: `Ссылка на профиль: ${url}` });
        }
        render();
      },
    },
    dispose() {
      disposed = true;
      revision++;
    },
  };
}
