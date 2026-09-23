import { HttpError } from '../../shared/http-error.js';

async function readJson(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers?.['content-type'] || '')) {
    throw new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Ожидается application/json.');
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += Buffer.byteLength(chunk);
    if (size > 128 * 1024)
      throw new HttpError(
        413,
        'BODY_TOO_LARGE',
        'Слишком большой запрос. Сократите описание и ответы.',
      );
    chunks.push(Buffer.from(chunk));
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'INVALID_JSON', 'Некорректный JSON запроса.');
  }
}

export function resolveAnalysisOperation(path) {
  return /^\/api\/ai\/task-analysis\/(questions|generate|score)$/.exec(path)?.[1];
}

export async function handleAnalysis(request, response, service, operation) {
  if (request.method !== 'POST')
    throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Only POST is supported.');
  const input = await readJson(request);
  const controller = new AbortController();
  const abort = () => {
    if (!response.writableEnded) controller.abort();
  };
  response.once('close', abort);
  try {
    return await service.run(operation, input, controller.signal);
  } finally {
    response.removeListener('close', abort);
  }
}
