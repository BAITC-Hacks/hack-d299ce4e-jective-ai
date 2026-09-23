import {
  validateTask,
  validateTaskList,
  validateTaskWrite,
  validateTaskWorkspace,
} from '@ai-sana/contracts';
import { ApiError, createHttpClient } from '../../shared/api/client.js';

/** Always use the API. Old mock configuration cannot reintroduce fixture tasks. */
export function createTasksRepository(
  config,
  client = createHttpClient({ baseUrl: config.apiBaseUrl }),
  { getAccessToken = async () => null } = {},
) {
  async function headers(userId) {
    const token = await getAccessToken(userId);
    if (!token)
      throw new ApiError('Войдите в аккаунт, чтобы сохранить задачу.', {
        code: 'UNAUTHORIZED',
        status: 401,
      });
    return { Authorization: `Bearer ${token}` };
  }
  return {
    list: async () => validateTaskList(await client.get('/tasks')),
    find: async (id) => validateTask(await client.get(`/tasks/${encodeURIComponent(id)}`)),
    mine: async ({ userId } = {}) =>
      validateTaskList(await client.get('/tasks/mine', { headers: await headers(userId) })),
    async save(value, { userId } = {}) {
      const payload = validateTaskWrite(value);
      return validateTask(
        await client.request('/tasks', {
          method: 'POST',
          headers: { ...(await headers(userId)), 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }),
      );
    },
    async loadWorkspace({ userId } = {}) {
      const value = await client.get('/task-workspace', { headers: await headers(userId) });
      return value === null ? null : validateTaskWorkspace(value);
    },
    async saveWorkspace(value, { userId } = {}) {
      return validateTaskWorkspace(
        await client.request('/task-workspace', {
          method: 'PUT',
          headers: { ...(await headers(userId)), 'Content-Type': 'application/json' },
          body: JSON.stringify(validateTaskWorkspace(value)),
        }),
      );
    },
  };
}
