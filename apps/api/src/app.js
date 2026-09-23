import { API_PATHS } from '@ai-sana/contracts';
import { createDemoTaskRepository } from './modules/tasks/repository.js';
import { createTaskService } from './modules/tasks/service.js';
import { createTaskRouter } from './modules/tasks/router.js';
import { HttpError } from './shared/http-error.js';
import { createTaskAnalysisService } from './modules/task-analysis/service.js';
import { handleAnalysis, resolveAnalysisOperation } from './modules/task-analysis/router.js';

function sendJson(request, response, status, payload, headers = {}) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  });
  response.end(request.method === 'HEAD' ? undefined : body);
}

/**
 * Build a Node HTTP handler without binding a port.
 * @param {{ taskRepository?: import('./modules/tasks/repository.js').TaskRepository,
 *   logger?: Pick<Console, 'error'> }} [options]
 */
export function createApp({
  taskRepository = createDemoTaskRepository(),
  logger = console,
  analysisService = createTaskAnalysisService(),
} = {}) {
  const tasks = createTaskRouter(createTaskService(taskRepository));

  return async function handleRequest(request, response) {
    let analysisOperation;
    try {
      let url;
      try {
        url = new URL(request.url, 'http://localhost');
      } catch {
        throw new HttpError(400, 'INVALID_URL', 'Invalid request URL.');
      }

      analysisOperation = resolveAnalysisOperation(url.pathname);
      if (analysisOperation) {
        const data = await handleAnalysis(request, response, analysisService, analysisOperation);
        sendJson(request, response, 200, { data });
        return;
      }
      const operation =
        url.pathname === API_PATHS.health ? () => ({ status: 'ok' }) : tasks.resolve(url.pathname);
      if (!operation) throw new HttpError(404, 'NOT_FOUND', 'Route not found.');
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Only GET and HEAD are supported.');
      }

      sendJson(request, response, 200, { data: await operation() });
    } catch (error) {
      const expected = error instanceof HttpError;
      if (!expected) logger.error('API request failed:', error);
      const status = expected ? error.status : 500;
      sendJson(
        request,
        response,
        status,
        {
          error: {
            code: expected ? error.code : 'INTERNAL_ERROR',
            message: expected ? error.message : 'Internal server error.',
          },
        },
        status === 405 ? { Allow: analysisOperation ? 'POST' : 'GET, HEAD' } : {},
      );
    }
  };
}
