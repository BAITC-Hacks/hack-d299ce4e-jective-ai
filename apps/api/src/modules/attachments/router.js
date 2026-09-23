import { MAX_ATTACHMENT_BYTES } from '@ai-sana/contracts/attachments';
import { HttpError } from '../../shared/http-error.js';

export async function requireBusiness(auth, request) {
  const identity = await auth.getCurrentUser(request);
  if (identity.profile.role !== 'business')
    throw new HttpError(403, 'BUSINESS_ONLY', 'Вложения доступны владельцу бизнес-задачи.');
  return identity.user.id;
}
export function createAttachmentsRouter(service, auth) {
  return async function handle(request, response, url) {
    const match = /^\/api\/task-attachments(?:\/([0-9a-f-]+)(?:\/(analyze|download))?)?$/.exec(
      url.pathname,
    );
    if (!match) throw new HttpError(404, 'NOT_FOUND', 'Route not found.');
    const [, id, action] = match;
    const allowed = id
      ? action === 'download'
        ? 'GET'
        : action === 'analyze'
          ? 'POST'
          : 'DELETE'
      : 'GET, POST';
    if (!allowed.split(', ').includes(request.method)) {
      const error = new HttpError(405, 'METHOD_NOT_ALLOWED', 'Unsupported attachment operation.');
      error.allow = allowed;
      throw error;
    }
    const userId = await requireBusiness(auth, request);
    if (!id && request.method === 'GET')
      return service.list(request, userId, url.searchParams.get('draft'));
    if (!id) {
      if (request.headers['content-type']?.split(';')[0] !== 'application/octet-stream')
        throw new HttpError(415, 'INVALID_CONTENT_TYPE', 'Ожидается файл.');
      if (Number(request.headers['content-length']) > MAX_ATTACHMENT_BYTES)
        throw new HttpError(413, 'FILE_TOO_LARGE', 'Максимальный размер файла — 10 МБ.');
      const chunks = [];
      let size = 0;
      for await (const chunk of request) {
        size += Buffer.byteLength(chunk);
        if (size > MAX_ATTACHMENT_BYTES)
          throw new HttpError(413, 'FILE_TOO_LARGE', 'Максимальный размер файла — 10 МБ.');
        chunks.push(Buffer.from(chunk));
      }
      return service.upload(
        request,
        userId,
        url.searchParams.get('draft'),
        url.searchParams.get('name'),
        Buffer.concat(chunks),
      );
    }
    if (action === 'download') return service.download(request, userId, id);
    if (request.method === 'DELETE') return service.remove(request, userId, id);
    const controller = new AbortController();
    const abort = () => {
      if (!response.writableEnded) controller.abort();
    };
    response.once('close', abort);
    try {
      return await service.analyze(request, userId, id, controller.signal);
    } finally {
      response.removeListener('close', abort);
    }
  };
}
