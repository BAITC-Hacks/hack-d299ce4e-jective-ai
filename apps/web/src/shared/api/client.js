export class ApiError extends Error {
  constructor(message, { status = 0, code = 'NETWORK_ERROR', cause } = {}) {
    super(message, { cause });
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

/** All browser HTTP requests go through this client; returned values unwrap { data }. */
export function createHttpClient({ baseUrl = '/api', fetchImpl = fetch, timeoutMs = 10000 } = {}) {
  async function request(path, { signal, headers, ...options } = {}) {
    const controller = new AbortController();
    const abort = () => controller.abort(signal.reason);
    if (signal?.aborted) abort();
    else signal?.addEventListener('abort', abort, { once: true });
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`, {
        ...options,
        headers: { Accept: 'application/json', ...headers },
        signal: controller.signal,
        credentials: 'same-origin',
      });
      if (response.status === 204) return undefined;

      let payload;
      try {
        payload = await response.json();
      } catch (cause) {
        if (controller.signal.aborted) throw cause;
        throw new ApiError('Сервер вернул некорректный JSON.', {
          status: response.status,
          code: 'INVALID_RESPONSE',
          cause,
        });
      }
      if (!response.ok) {
        throw new ApiError(payload?.error?.message || 'Не удалось выполнить запрос.', {
          status: response.status,
          code: payload?.error?.code || 'HTTP_ERROR',
        });
      }
      if (!payload || !Object.hasOwn(payload, 'data')) {
        throw new ApiError('В ответе сервера отсутствует поле data.', { code: 'INVALID_RESPONSE' });
      }
      return payload.data;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(
        controller.signal.aborted
          ? 'Запрос отменён или превышено время ожидания.'
          : 'Сервер недоступен. Повторите попытку.',
        { code: controller.signal.aborted ? 'ABORTED' : 'NETWORK_ERROR', cause: error },
      );
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
    }
  }

  return { request, get: (path, options) => request(path, { ...options, method: 'GET' }) };
}
