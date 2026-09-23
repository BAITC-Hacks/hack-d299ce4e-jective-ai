import { describe, expect, it } from 'vitest';
import { createLocalStore, LocalStoreError } from './localStore';
import type { TaskDraft } from '../types';

function fixture() {
  const data = new Map<string, string>();
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
  };
  return { data, storage, store: createLocalStore(() => storage) };
}

const draft: TaskDraft = {
  id: 'draft-1', rawDescription: 'Хотим снизить отсев учеников',
  questions: [], answers: {}, createdAt: '2026-09-23T10:00:00.000Z',
};

describe('localStore', () => {
  it('persists, updates without duplicates, and removes a draft', () => {
    const { store, storage } = fixture();
    expect(store.drafts.list()).toEqual([]);
    store.drafts.upsert(draft);
    const reopened = createLocalStore(() => storage);
    expect(reopened.drafts.get(draft.id)).toEqual(draft);
    reopened.drafts.upsert({ ...draft, answers: { q1: 'Ученики 8–10 классов' } });
    expect(store.drafts.list()).toHaveLength(1);
    expect(store.drafts.get(draft.id)?.answers.q1).toBe('Ученики 8–10 классов');
    store.drafts.remove(draft.id);
    expect(store.drafts.get(draft.id)).toBeUndefined();
  });

  it.each(['{invalid', '{}', '[{"id":"incomplete"}]'])(
    'preserves damaged or incompatible storage: %s', raw => {
      const { data, store } = fixture();
      data.set('task-readiness:v1:drafts', raw);
      expect(() => store.drafts.list()).toThrow(LocalStoreError);
      expect(() => store.drafts.upsert(draft)).toThrow(LocalStoreError);
      expect(data.get('task-readiness:v1:drafts')).toBe(raw);
    },
  );

  it('reports unavailable browser storage and quota errors', () => {
    const unavailable = createLocalStore(() => { throw new Error('Access denied'); });
    expect(() => unavailable.tasks.list()).toThrow(LocalStoreError);
    const full = createLocalStore(() => ({ getItem: () => null, setItem: () => { throw new Error('Quota exceeded'); } }));
    expect(() => full.drafts.upsert(draft)).toThrow(LocalStoreError);
  });

  it('keeps collections and unrelated application data separate', () => {
    const { data, store } = fixture();
    data.set('another-app', 'keep');
    store.drafts.upsert(draft);
    store.teams.upsert({ id: draft.id, name: 'Team', skills: ['React'], interests: [] });
    store.drafts.remove(draft.id);
    expect(store.teams.list()).toHaveLength(1);
    expect(data.get('another-app')).toBe('keep');
  });
});
