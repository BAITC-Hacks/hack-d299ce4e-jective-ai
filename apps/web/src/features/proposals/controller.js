export function createProposalsController({ store, router, service, feedback, reloadCatalog }) {
  let key = '',
    version = 0,
    busy = false,
    disposed = false;
  const owner = () => store.getState().auth.user?.id;
  const patch = (data) =>
    store.update((s) => ({ ...s, proposalsData: { ...s.proposalsData, ...data } }));
  async function sync(force = false) {
    if (disposed) return;
    const path = window.location.hash.split('?')[0];
    const next = `${owner()}:${path}`;
    if (!force && key === next) return;
    key = next;
    const current = ++version,
      user = owner();
    if (!user || !['#/proposals', '#/my-proposals', '#/student'].includes(path)) return;
    patch({ status: 'loading', items: [], error: '' });
    router.render();
    try {
      const items = await service.list();
      if (current !== version || owner() !== user) return;
      patch({ status: 'ready', items });
    } catch (error) {
      if (current !== version || owner() !== user) return;
      patch({ status: 'error', error: error.message });
    }
    router.render();
  }
  async function run(operation) {
    if (busy || disposed || !owner()) return;
    busy = true;
    const user = owner();
    try {
      await operation(user, () => !disposed && owner() === user);
    } catch (error) {
      if (owner() === user) feedback.toast(error.message);
    } finally {
      busy = false;
    }
  }
  return {
    sync,
    publish: () =>
      run(async (user, active) => {
        const button = document.querySelector('[data-action="confirm-publish"]');
        if (button) {
          button.disabled = true;
          button.textContent = 'Сохранение…';
        }
        try {
          const task = await service.publish(user, store.getState());
          if (!active()) return;
          feedback.closeModal();
          await reloadCatalog();
          if (active()) router.navigate(`detail?id=${task.id}`);
        } finally {
          if (button) {
            button.disabled = false;
            button.textContent = 'Опубликовать';
          }
        }
      }),
    submit: (form) => {
      const values = Object.fromEntries(new FormData(form));
      const taskId = Number(form.dataset.taskId);
      return run(async (user, active) => {
        const button = form.querySelector('button[type="submit"]');
        button.disabled = true;
        button.textContent = 'Сохранение…';
        try {
          await service.send(user, taskId, values);
          if (!active()) return;
          feedback.closeModal();
          key = '';
          router.navigate('my-proposals');
        } finally {
          button.disabled = false;
          button.textContent = 'Отправить предложение';
        }
      });
    },
    actions: {
      'reload-proposals': () => sync(true),
      'proposal-select': (el) =>
        run(async (_user, active) => {
          await service.decide(el.dataset.id, 'selected');
          if (active()) await sync(true);
        }),
      'proposal-reject': (el) =>
        run(async (_user, active) => {
          await service.decide(el.dataset.id, 'rejected');
          if (active()) await sync(true);
        }),
    },
    dispose() {
      disposed = true;
      version++;
    },
  };
}
