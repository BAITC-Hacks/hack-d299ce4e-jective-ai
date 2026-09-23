import { validateTaskList } from '@ai-sana/contracts';
import { demoTasks } from '@ai-sana/contracts/fixtures';
import { createHttpClient } from '../../shared/api/client.js';

/** Both adapters implement list(): Promise<Task[]>; pages never know the transport. */
export function createTasksRepository(
  config,
  client = createHttpClient({ baseUrl: config.apiBaseUrl }),
) {
  if (config.dataSource === 'mock') {
    return { list: async () => validateTaskList(structuredClone(demoTasks)) };
  }
  if (config.dataSource !== 'api') throw new Error('Unknown tasks data source.');
  return { list: async () => validateTaskList(await client.get('/tasks')) };
}
