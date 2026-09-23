import {
  validateTask,
  validateTaskList,
  validateTaskWrite,
  validateTaskWorkspace,
} from '@ai-sana/contracts';
import { HttpError } from '../../shared/http-error.js';
import { readBearerToken } from '../auth/service.js';
import { readJsonBody } from '../../shared/json-body.js';

function publicTask(value) {
  const task = validateTask(value);
  delete task.requestId;
  delete task.originalDescription;
  delete task.analysisSnapshot;
  if (task.card) task.card.businessContact = null;
  return task;
}

/** Database adapter methods are injected for deterministic tests. */
export function createTaskService(repository, authService) {
  async function identity(request) {
    const { user, profile } = await authService.getCurrentUser(request);
    if (profile.role !== 'business')
      throw new HttpError(403, 'TASKS_FORBIDDEN', 'Создавать задачи может только бизнес-профиль.');
    return { ownerId: user.id, accessToken: readBearerToken(request) };
  }
  return {
    async list() {
      return (await repository.list()).map(publicTask);
    },
    async findById(rawId) {
      const id = Number(rawId);
      if (!/^[1-9]\d*$/.test(String(rawId)) || !Number.isSafeInteger(id)) {
        throw new HttpError(400, 'INVALID_TASK_ID', 'Task id must be a positive integer.');
      }
      const task = await repository.findById(id);
      if (!task) {
        throw new HttpError(404, 'TASK_NOT_FOUND', 'Task not found.');
      }
      return publicTask(task);
    },
    async listMine(request) {
      return validateTaskList(await repository.listMine(await identity(request)));
    },
    async save(request) {
      const owner = await identity(request);
      const body = await readJsonBody(request);
      let input;
      try {
        input = validateTaskWrite(body);
      } catch (error) {
        throw new HttpError(400, 'INVALID_TASK', error.message);
      }
      const snapshot = await repository.getWorkspace(owner);
      if (!snapshot || snapshot.requestId !== input.requestId)
        throw new HttpError(
          409,
          'WORKSPACE_OUT_OF_SYNC',
          'Сначала синхронизируйте ответы и черновик с Supabase, затем повторите сохранение задачи.',
        );
      return validateTask(await repository.save(input, owner, snapshot));
    },
    async getWorkspace(request) {
      const snapshot = await repository.getWorkspace(await identity(request));
      return snapshot ? validateTaskWorkspace(snapshot) : null;
    },
    async saveWorkspace(request) {
      const owner = await identity(request);
      const body = await readJsonBody(request, 256 * 1024);
      let snapshot;
      try {
        snapshot = validateTaskWorkspace(body);
      } catch (error) {
        throw new HttpError(400, 'INVALID_TASK_WORKSPACE', error.message);
      }
      return validateTaskWorkspace(await repository.saveWorkspace(snapshot, owner));
    },
  };
}
