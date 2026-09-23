/** Each app/test gets its own store. Views only read it; actions update it explicitly. */
export function createStore(initialState) {
  let current = structuredClone(initialState);

  return {
    getState: () => current,
    update(updater) {
      current = updater(current);
      return current;
    },
  };
}
