import { HttpError } from './http-error.js';

/** Bounded JSON parsing for task writes. */
export async function readJsonBody(request, maxBytes = 128 * 1024) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers?.['content-type'] || ''))
    throw new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Ожидается application/json.');
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += Buffer.byteLength(chunk);
    if (size > maxBytes)
      throw new HttpError(413, 'BODY_TOO_LARGE', 'Слишком большой запрос задачи.');
    chunks.push(Buffer.from(chunk));
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'INVALID_JSON', 'Некорректный JSON запроса.');
  }
}
