/** Each app/test gets its own store. Views only read it; actions update it explicitly. */
export function createStore(initialState) {
  let current = structuredClone(initialState);
  const listeners = new Set();

  return {
    getState: () => current,
    update(updater) {
      current = updater(current);
      for (const listener of listeners) listener(current);
      return current;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
