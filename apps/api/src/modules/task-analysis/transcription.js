import { HttpError } from '../../shared/http-error.js';

const formats = {
  'audio/webm': 'webm',
  'audio/mp4': 'mp4',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/mpeg': 'mp3',
};
export const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

export function createTranscriptionService({
  apiKey = process.env.OPENAI_API_KEY,
  model = process.env.OPENAI_TRANSCRIPTION_MODEL || 'gpt-4o-mini-transcribe',
  fetchImpl = fetch,
  timeoutMs = 60000,
} = {}) {
  return {
    async transcribe(bytes, mime, signal) {
      if (!formats[mime])
        throw new HttpError(
          415,
          'UNSUPPORTED_AUDIO',
          'Формат записи не поддерживается. Используйте другой браузер.',
        );
      if (!bytes.length)
        throw new HttpError(400, 'EMPTY_AUDIO', 'Запись пуста. Попробуйте записать ещё раз.');
      if (bytes.length > MAX_AUDIO_BYTES)
        throw new HttpError(
          413,
          'AUDIO_TOO_LARGE',
          'Запись слишком большая. Запишите более короткое сообщение.',
        );
      if (!apiKey?.trim())
        throw new HttpError(
          503,
          'AI_NOT_CONFIGURED',
          'Распознавание речи не настроено на сервере.',
        );
      const controller = new AbortController();
      const abort = () => controller.abort();
      if (signal?.aborted) abort();
      else signal?.addEventListener('abort', abort, { once: true });
      const timer = setTimeout(abort, timeoutMs);
      try {
        const body = new FormData();
        body.set('file', new Blob([bytes], { type: mime }), `recording.${formats[mime]}`);
        body.set('model', model);
        body.set('response_format', 'json');
        const response = await fetchImpl('https://api.openai.com/v1/audio/transcriptions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey.trim()}` },
          body,
          signal: controller.signal,
        });
        if (!response.ok) {
          if (response.status === 429)
            throw new HttpError(429, 'AI_RATE_LIMIT', 'Достигнут лимит OpenAI. Попробуйте позже.');
          if ([401, 403].includes(response.status))
            throw new HttpError(
              502,
              'AI_AUTH_ERROR',
              'OpenAI отклонил доступ. Проверьте серверный API-ключ.',
            );
          throw new HttpError(
            502,
            'TRANSCRIPTION_FAILED',
            'OpenAI не смог распознать запись. Повторите попытку или запишите ещё раз.',
          );
        }
        const value = await response.json();
        if (typeof value?.text !== 'string' || !value.text.trim())
          throw new HttpError(
            422,
            'NO_SPEECH',
            'Речь не распознана. Говорите ближе к микрофону и попробуйте ещё раз.',
          );
        if (value.text.length > 10000)
          throw new HttpError(
            422,
            'TRANSCRIPT_TOO_LONG',
            'Распознанный текст слишком длинный. Запишите более короткое сообщение.',
          );
        return { text: value.text.trim() };
      } catch (error) {
        if (controller.signal.aborted)
          throw new HttpError(504, 'AI_TIMEOUT', 'Время распознавания истекло. Повторите попытку.');
        if (error instanceof HttpError) throw error;
        throw new HttpError(
          502,
          'TRANSCRIPTION_FAILED',
          'Не удалось распознать запись. Повторите попытку.',
        );
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
      }
    },
  };
}

export async function handleTranscription(request, response, service) {
  if (request.method !== 'POST')
    throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Only POST is supported.');
  const mime = (request.headers?.['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (!formats[mime]) throw new HttpError(415, 'UNSUPPORTED_AUDIO', 'Ожидается аудиозапись.');
  if (Number(request.headers?.['content-length']) > MAX_AUDIO_BYTES)
    throw new HttpError(413, 'AUDIO_TOO_LARGE', 'Запись превышает 10 МБ.');
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += Buffer.byteLength(chunk);
    if (size > MAX_AUDIO_BYTES)
      throw new HttpError(413, 'AUDIO_TOO_LARGE', 'Запись превышает 10 МБ.');
    chunks.push(Buffer.from(chunk));
  }
  const controller = new AbortController();
  const abort = () => {
    if (!response.writableEnded) controller.abort();
  };
  response.once('close', abort);
  try {
    return await service.transcribe(Buffer.concat(chunks), mime, controller.signal);
  } finally {
    response.removeListener('close', abort);
  }
}
