import { MAX_ATTACHMENTS, isUuid, validateAttachment } from '@ai-sana/contracts/attachments';

export const attachmentsBusy = (state) =>
  state.attachments?.status === 'loading' ||
  state.attachments?.items.some((i) => ['uploading', 'analyzing', 'deleting'].includes(i.status));
export function createAttachmentsController({
  store,
  render,
  service,
  storage = globalThis.localStorage,
  uuid = () => crypto.randomUUID(),
}) {
  let disposed = false,
    epoch = 0;
  const originals = new Map();
  const state = () => store.getState().attachments || { status: 'idle', items: [], error: '' };
  const user = () =>
    store.getState().auth?.status === 'authenticated' &&
    store.getState().auth?.profile?.role === 'business'
      ? store.getState().auth.user.id
      : null;
  const show = (patch) => {
    store.update((s) => ({ ...s, attachments: { ...state(), ...patch } }));
    render();
  };
  const patchItem = (id, patch) =>
    show({ items: state().items.map((i) => (i.id === id ? { ...i, ...patch } : i)) });
  const active = (owner, version) => !disposed && owner === user() && version === epoch;
  function draft(owner) {
    const key = `ai-sana:attachment-draft:${owner}`;
    let value;
    try {
      value = storage?.getItem(key);
    } catch {
      /* Storage may be disabled. */
    }
    if (!isUuid(value)) {
      value = uuid();
      try {
        storage?.setItem(key, value);
      } catch {
        /* Session-only fallback. */
      }
    }
    return value;
  }
  async function load(force = false) {
    const owner = user();
    if (!owner || disposed || (!force && state().owner === owner && state().status !== 'idle'))
      return;
    if (attachmentsBusy(store.getState())) return;
    const version = ++epoch;
    originals.clear();
    const draftId = state().owner === owner && state().draftId ? state().draftId : draft(owner);
    show({ owner, draftId, status: 'loading', items: [], error: '' });
    try {
      const rows = await service.list(draftId);
      if (active(owner, version))
        show({
          status: 'ready',
          items: rows.map((i) => ({
            ...i,
            status: i.extracted_context ? 'ready' : 'uploaded',
            selected: Boolean(i.extracted_context),
          })),
        });
    } catch (error) {
      if (active(owner, version)) show({ status: 'error', error: error.message });
    }
  }
  async function process(id, owner = user(), version = epoch) {
    const item = state().items.find((i) => i.id === id);
    if (!item || !active(owner, version) || ['analyzing', 'deleting'].includes(item.status)) return;
    let saved = item;
    try {
      if (originals.has(id)) {
        patchItem(id, { status: 'uploading', error: '', selected: false });
        saved = await service.upload(state().draftId, originals.get(id));
        originals.delete(id);
        if (!active(owner, version)) return;
        patchItem(id, { ...saved, status: 'uploaded', selected: false });
      }
      if (!active(owner, version)) return;
      patchItem(saved.id, { status: 'analyzing', error: '', selected: false });
      const ready = await service.analyze(saved.id);
      if (active(owner, version))
        patchItem(saved.id, {
          ...ready,
          status: 'ready',
          selected: Boolean(ready.extracted_context?.facts.length),
        });
    } catch (error) {
      if (active(owner, version))
        patchItem(saved.id, { status: 'error', error: error.message, selected: false });
    }
  }
  return {
    load,
    async add(files) {
      if (!user() || attachmentsBusy(store.getState())) return;
      if (state().status !== 'ready') {
        await load(true);
        if (state().status !== 'ready') return;
      }
      const owner = user(),
        version = epoch;
      const errors = [],
        added = [];
      for (const file of Array.from(files)) {
        try {
          validateAttachment(file.name, file.size);
          if (state().items.length >= MAX_ATTACHMENTS)
            throw new Error('Не более пяти вложений на задачу.');
          if (state().items.some((i) => i.name === file.name && i.size_bytes === file.size))
            throw new Error(`«${file.name}» уже добавлен.`);
          const id = uuid();
          originals.set(id, file);
          show({
            items: [
              ...state().items,
              { id, name: file.name, size_bytes: file.size, status: 'uploading', selected: false },
            ],
          });
          added.push(id);
        } catch (error) {
          errors.push(`${file.name}: ${error.message}`);
        }
      }
      show({ error: errors.join(' ') });
      for (const id of added) {
        if (!active(owner, version)) break;
        await process(id, owner, version);
      }
    },
    retry: (id) => process(id),
    toggle(id, selected) {
      patchItem(id, { selected });
    },
    async remove(id) {
      const item = state().items.find((i) => i.id === id);
      if (!item || attachmentsBusy(store.getState())) return;
      const owner = user(),
        version = epoch;
      patchItem(id, { status: 'deleting', selected: false, error: '' });
      try {
        if (!originals.has(id)) await service.remove(id);
        originals.delete(id);
        if (active(owner, version)) show({ items: state().items.filter((i) => i.id !== id) });
      } catch (error) {
        if (active(owner, version)) patchItem(id, { status: 'error', error: error.message });
      }
    },
    async download(id) {
      const owner = user(),
        version = epoch;
      try {
        const data = await service.download(id);
        if (active(owner, version)) return data;
      } catch (error) {
        if (active(owner, version)) show({ error: error.message });
      }
    },
    dispose() {
      disposed = true;
      epoch++;
      originals.clear();
    },
  };
}
