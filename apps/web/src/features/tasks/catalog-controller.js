export function createCatalogController({ store, repository, render }) {
  let pending;
  let disposed = false;

  function load() {
    if (disposed) return Promise.resolve();
    if (pending) return pending;
    store.update((state) => ({
      ...state,
      catalog: { ...state.catalog, status: 'loading', error: '' },
    }));
    render();
    pending = Promise.resolve()
      .then(() => repository.list())
      .then((items) => {
        if (disposed) return;
        store.update((state) => ({ ...state, catalog: { items, status: 'ready', error: '' } }));
      })
      .catch((error) => {
        if (disposed) return;
        store.update((state) => ({
          ...state,
          catalog: {
            ...state.catalog,
            status: 'error',
            error: error.message || 'Не удалось загрузить задачи.',
          },
        }));
      })
      .finally(() => {
        pending = undefined;
        if (!disposed) render();
      });
    return pending;
  }

  return {
    load,
    dispose: () => {
      disposed = true;
    },
  };
}
