import { API_PATHS } from '@ai-sana/contracts';
import { createDemoTaskRepository } from './modules/tasks/repository.js';
import { createTaskService } from './modules/tasks/service.js';
import { createTaskRouter } from './modules/tasks/router.js';
import { createAuthRouter } from './modules/auth/router.js';
import { createSupabaseAuthService } from './modules/auth/service.js';
import { HttpError } from './shared/http-error.js';
import { createAttachmentsService } from './modules/attachments/service.js';
import { createAttachmentsRouter, requireBusiness } from './modules/attachments/router.js';
import { createTaskAnalysisService } from './modules/task-analysis/service.js';
import { handleAnalysis, resolveAnalysisOperation } from './modules/task-analysis/router.js';
import {
  createTranscriptionService,
  handleTranscription,
} from './modules/task-analysis/transcription.js';

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
 *   authService?: ReturnType<typeof createSupabaseAuthService>,
 *   logger?: Pick<Console, 'error'> }} [options]
 */
export function createApp({
  taskRepository = createDemoTaskRepository(),
  authService = createSupabaseAuthService(),
  logger = console,
  analysisService = createTaskAnalysisService(),
  transcriptionService = createTranscriptionService(),
  attachmentsService = createAttachmentsService(),
} = {}) {
  const tasks = createTaskRouter(createTaskService(taskRepository));
  const auth = createAuthRouter(authService);
  const attachments = createAttachmentsRouter(attachmentsService, authService);
  async function attachmentContexts(request, ids) {
    if (ids === undefined || (Array.isArray(ids) && ids.length === 0)) return [];
    const userId = await requireBusiness(authService, request);
    try {
      return await attachmentsService.contexts(request, userId, ids);
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(
        503,
        'ATTACHMENTS_UNAVAILABLE',
        'Не удалось прочитать вложения. Повторите попытку.',
      );
    }
  }

  return async function handleRequest(request, response) {
    let analysisOperation;
    try {
      let url;
      try {
        url = new URL(request.url, 'http://localhost');
      } catch {
        throw new HttpError(400, 'INVALID_URL', 'Invalid request URL.');
      }

      if (url.pathname.startsWith('/api/task-attachments')) {
        analysisOperation = 'attachments';
        let data;
        try {
          data = await attachments(request, response, url);
        } catch (error) {
          if (error instanceof HttpError) throw error;
          throw new HttpError(
            503,
            'ATTACHMENTS_UNAVAILABLE',
            'Хранилище временно недоступно. Повторите попытку.',
          );
        }
        sendJson(request, response, 200, { data });
        return;
      }
      if (url.pathname === '/api/ai/task-analysis/transcribe') {
        analysisOperation = 'transcribe';
        const data = await handleTranscription(request, response, transcriptionService);
        sendJson(request, response, 200, { data });
        return;
      }
      analysisOperation = resolveAnalysisOperation(url.pathname);
      if (analysisOperation) {
        const data = await handleAnalysis(
          request,
          response,
          analysisService,
          analysisOperation,
          attachmentContexts,
        );
        sendJson(request, response, 200, { data });
        return;
      }
      const operation =
        url.pathname === API_PATHS.health
          ? () => ({ status: 'ok' })
          : auth.resolve(url.pathname, request) || tasks.resolve(url.pathname);
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
        status === 405 ? { Allow: error.allow || (analysisOperation ? 'POST' : 'GET, HEAD') } : {},
      );
    }
  };
}
