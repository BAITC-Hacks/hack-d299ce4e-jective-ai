import { z } from 'zod';
import { draftSchema, proposalSchema, taskSchema, teamSchema } from './schemas';

export class LocalStoreError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'LocalStoreError';
  }
}

type StorageProvider = () => Pick<Storage, 'getItem' | 'setItem'>;

function collection<T extends { id: string }>(name: string, schema: z.ZodType<T>, storage: StorageProvider) {
  const key = `task-readiness:v1:${name}`;
  const listSchema = z.array(schema).refine(
    items => new Set(items.map(item => item.id)).size === items.length,
    'Duplicate IDs',
  );

  function list(): T[] {
    try {
      const raw = storage().getItem(key);
      return raw === null ? [] : listSchema.parse(JSON.parse(raw));
    } catch (cause) {
      // Never replace corrupt data with an empty collection on the next write.
      throw new LocalStoreError('Не удалось прочитать локальные данные. Проверьте доступ к хранилищу браузера; сохранённые данные не изменены.', { cause });
    }
  }

  function write(items: T[]): void {
    try {
      storage().setItem(key, JSON.stringify(listSchema.parse(items)));
    } catch (cause) {
      throw new LocalStoreError('Не удалось сохранить изменения. Проверьте свободное место и доступ к хранилищу браузера.', { cause });
    }
  }

  return {
    list,
    get(id: string): T | undefined { return list().find(item => item.id === id); },
    upsert(item: T): void {
      const items = list();
      const index = items.findIndex(existing => existing.id === item.id);
      if (index < 0) items.push(item);
      else items[index] = item;
      write(items);
    },
    remove(id: string): void { write(list().filter(item => item.id !== id)); },
  };
}

// Lazy browser access also permits use of this module in Node tests.
export function createLocalStore(storage: StorageProvider = () => window.localStorage) {
  return {
    drafts: collection('drafts', draftSchema, storage),
    tasks: collection('tasks', taskSchema, storage),
    teams: collection('teams', teamSchema, storage),
    proposals: collection('proposals', proposalSchema, storage),
  };
}

export const localStore = createLocalStore();
