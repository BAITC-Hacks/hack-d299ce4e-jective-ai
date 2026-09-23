import { validateTask, validateTaskList } from '@ai-sana/contracts';
import { demoTasks } from '@ai-sana/contracts/fixtures';

/**
 * Replace this adapter with a database repository without changing HTTP or UI.
 * @typedef {object} TaskRepository
 * @property {() => Promise<import('@ai-sana/contracts').Task[]>} list
 * @property {(id: number) => Promise<import('@ai-sana/contracts').Task | null>} findById
 */

/** @returns {TaskRepository} */
export function createDemoTaskRepository() {
  return {
    async list() {
      return validateTaskList(demoTasks);
    },
    async findById(id) {
      const task = demoTasks.find((item) => item.id === id);
      return task ? validateTask(task) : null;
    },
  };
}
