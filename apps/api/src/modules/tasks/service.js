import { validateTask, validateTaskList } from '@ai-sana/contracts';
import { HttpError } from '../../shared/http-error.js';

/** @param {import('./repository.js').TaskRepository} repository */
export function createTaskService(repository) {
  return {
    async list() {
      return validateTaskList(await repository.list());
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
      return validateTask(task);
    },
  };
}
