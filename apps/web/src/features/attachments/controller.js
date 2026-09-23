import { MAX_ATTACHMENTS, isUuid, validateAttachment } from '@ai-sana/contracts/attachments';

export const attachmentsBusy = (state) =>
  state.attachments?.status === 'loading' ||
  state.attachments?.items.some((i) => ['uploading', 'analyzing', 'deleting'].includes(i.status));
export function createAttachmentsController({
  store,
  render,
  service,
  storage,
  uuid = () => crypto.randomUUID(),
}) {
  let disposed = false,
    epoch = 0;
  const originals = new Map();
  const processing = new Set();
  if (storage === undefined) {
    try {
      storage = globalThis.localStorage;
    } catch {
      /* Storage may be disabled. */
    }
  }
  const state = () => store.getState().attachments || { status: 'idle', items: [], error: '' };
  const user = () =>
    store.getState().auth?.status === 'authenticated' &&
    store.getState().auth?.profile?.role === 'business'
      ? store.getState().auth.user.id
      : null;
  const show = (patch) => {
    store.update((s) => {
      const next = { ...state(), ...patch };
      return {
        ...s,
        ...(patch.draftId ? { attachmentDraftId: patch.draftId } : {}),
        ...(patch.items && patch.status !== 'loading'
          ? {
              attachmentSelectedIds: next.items
                .filter((item) => item.selected)
                .map((item) => item.id),
            }
          : {}),
        attachments: next,
      };
    });
    render();
  };
  const patchItem = (id, patch) =>
    show({ items: state().items.map((i) => (i.id === id ? { ...i, ...patch } : i)) });
  const active = (owner, version, draftId) => {
    const auth = store.getState().auth;
    // A token refresh temporarily verifies the same session again. Its retained
    // verified profile may finish an existing request, but user() blocks new ones.
    return (
      !disposed &&
      Boolean(owner) &&
      owner === auth?.user?.id &&
      auth?.profile?.role === 'business' &&
      ['authenticated', 'initializing'].includes(auth.status) &&
      version === epoch &&
      (!draftId || store.getState().attachmentDraftId === draftId)
    );
  };
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
    const restoredDraft = store.getState().attachmentDraftId;
    const sameDraft = !restoredDraft || restoredDraft === state().draftId;
    if (
      !owner ||
      disposed ||
      (!force && sameDraft && state().owner === owner && state().status !== 'idle')
    )
      return;
    if (sameDraft && state().owner === owner && attachmentsBusy(store.getState())) return;
    const version = ++epoch;
    originals.clear();
    const draftId =
      restoredDraft ||
      (state().owner === owner && state().draftId ? state().draftId : draft(owner));
    const selectedIds = store.getState().attachmentSelectedIds;
    show({ owner, draftId, status: 'loading', items: [], error: '' });
    try {
      const rows = await service.list(draftId, { userId: owner });
      if (active(owner, version, draftId))
        show({
          status: 'ready',
          items: rows.map((i) => ({
            ...i,
            status: i.extracted_context ? 'ready' : 'uploaded',
            selected:
              Boolean(i.extracted_context) &&
              (selectedIds
                ? selectedIds.includes(i.id)
                : Boolean(i.extracted_context?.facts.length)),
          })),
        });
    } catch (error) {
      if (active(owner, version, draftId)) show({ status: 'error', error: error.message });
    }
  }
  async function process(id, owner = user(), version = epoch) {
    const item = state().items.find((i) => i.id === id);
    const draftId = state().draftId;
    if (
      !item ||
      !active(owner, version, draftId) ||
      processing.has(id) ||
      ['analyzing', 'deleting'].includes(item.status)
    )
      return;
    processing.add(id);
    let saved = item;
    try {
      if (originals.has(id)) {
        patchItem(id, { status: 'uploading', error: '', selected: false });
        saved = await service.upload(draftId, originals.get(id), { userId: owner });
        if (!active(owner, version, draftId)) return;
        originals.delete(id);
        patchItem(id, { ...saved, status: 'uploaded', selected: false });
      }
      if (!active(owner, version, draftId)) return;
      patchItem(saved.id, { status: 'analyzing', error: '', selected: false });
      const ready = await service.analyze(saved.id, { userId: owner });
      if (active(owner, version, draftId))
        patchItem(saved.id, {
          ...ready,
          status: 'ready',
          selected: Boolean(ready.extracted_context?.facts.length),
        });
    } catch (error) {
      if (active(owner, version, draftId))
        patchItem(saved.id, { status: 'error', error: error.message, selected: false });
    } finally {
      processing.delete(id);
    }
  }
  return {
    load,
    async add(files) {
      const initiatingOwner = user();
      if (!initiatingOwner || attachmentsBusy(store.getState())) return;
      if (state().status !== 'ready') {
        await load(true);
        if (state().status !== 'ready' || user() !== initiatingOwner) return;
      }
      const owner = user(),
        version = epoch,
        draftId = state().draftId;
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
        if (!active(owner, version, draftId)) break;
        await process(id, owner, version);
      }
    },
    retry: (id) => process(id),
    toggle(id, selected) {
      const item = state().items.find((entry) => entry.id === id);
      if (!user() || attachmentsBusy(store.getState()) || item?.status !== 'ready') return;
      patchItem(id, { selected });
    },
    async remove(id) {
      const item = state().items.find((i) => i.id === id);
      if (!item || attachmentsBusy(store.getState())) return;
      const owner = user(),
        version = epoch,
        draftId = state().draftId;
      if (!active(owner, version, draftId)) return;
      patchItem(id, { status: 'deleting', selected: false, error: '' });
      try {
        if (!originals.has(id)) await service.remove(id, { userId: owner });
        if (!active(owner, version, draftId)) return;
        originals.delete(id);
        if (active(owner, version, draftId))
          show({ items: state().items.filter((i) => i.id !== id) });
      } catch (error) {
        if (active(owner, version, draftId))
          patchItem(id, { status: 'error', error: error.message });
      }
    },
    async download(id) {
      const owner = user(),
        version = epoch,
        draftId = state().draftId;
      if (!active(owner, version, draftId)) return;
      try {
        const data = await service.download(id, { userId: owner });
        if (active(owner, version, draftId)) return data;
      } catch (error) {
        if (active(owner, version, draftId)) show({ error: error.message });
      }
    },
    reset() {
      epoch++;
      originals.clear();
      processing.clear();
      store.update((s) => ({
        ...s,
        attachmentDraftId: null,
        attachmentSelectedIds: undefined,
        attachments: { status: 'idle', owner: null, draftId: null, items: [], error: '' },
      }));
    },
    dispose() {
      disposed = true;
      epoch++;
      originals.clear();
    },
  };
}
