import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiError, createHttpClient } from '../src/shared/api/client.js';

function abortableFetch(_url, { signal }) {
  return new Promise((_resolve, reject) => {
    if (signal.aborted) reject(signal.reason);
    else signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  });
}

test('HTTP client joins paths, sends JSON request preferences, and unwraps data', async () => {
  let received;
  const client = createHttpClient({
    baseUrl: '/api/',
    async fetchImpl(url, options) {
      received = { url, options };
      return Response.json({ data: [{ id: 1 }] });
    },
  });
  assert.deepEqual(await client.get('/tasks', { headers: { 'X-Request-ID': 'test' } }), [
    { id: 1 },
  ]);
  assert.equal(received.url, '/api/tasks');
  assert.equal(received.options.method, 'GET');
  assert.equal(received.options.headers.Accept, 'application/json');
  assert.equal(received.options.headers['X-Request-ID'], 'test');
  assert.equal(received.options.credentials, 'same-origin');
  assert.ok(received.options.signal instanceof AbortSignal);
});

test('HTTP client accepts 204 and preserves typed API failures', async () => {
  const empty = createHttpClient({ fetchImpl: async () => new Response(null, { status: 204 }) });
  assert.equal(await empty.get('/tasks'), undefined);
  const failing = createHttpClient({
    fetchImpl: async () =>
      Response.json({ error: { code: 'UNAVAILABLE', message: 'Try later' } }, { status: 503 }),
  });
  await assert.rejects(failing.get('/tasks'), (error) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.status, 503);
    assert.equal(error.code, 'UNAVAILABLE');
    assert.equal(error.message, 'Try later');
    return true;
  });
});

test('malformed JSON and missing envelopes produce invalid-response errors', async () => {
  for (const response of [new Response('<html>Proxy error</html>'), Response.json({ tasks: [] })]) {
    const client = createHttpClient({ fetchImpl: async () => response });
    await assert.rejects(
      client.get('/tasks'),
      (error) => error instanceof ApiError && error.code === 'INVALID_RESPONSE',
    );
  }
});

test('network errors retain their cause and are distinguishable from HTTP failures', async () => {
  const cause = new TypeError('Connection refused');
  const client = createHttpClient({
    fetchImpl: async () => {
      throw cause;
    },
  });
  await assert.rejects(client.get('/tasks'), (error) => {
    assert.equal(error.code, 'NETWORK_ERROR');
    assert.equal(error.status, 0);
    assert.equal(error.cause, cause);
    return true;
  });
});

test('caller cancellation reaches fetch, including already-aborted signals', async () => {
  for (const abortBeforeRequest of [false, true]) {
    const controller = new AbortController();
    if (abortBeforeRequest) controller.abort();
    const client = createHttpClient({ fetchImpl: abortableFetch });
    const request = client.get('/tasks', { signal: controller.signal });
    if (!abortBeforeRequest) controller.abort();
    await assert.rejects(request, (error) => error instanceof ApiError && error.code === 'ABORTED');
  }
});

test('stalled requests abort at the configured timeout', { timeout: 1000 }, async () => {
  const client = createHttpClient({ fetchImpl: abortableFetch, timeoutMs: 5 });
  await assert.rejects(
    client.get('/tasks'),
    (error) => error instanceof ApiError && error.code === 'ABORTED',
  );
});

test(
  'timeout while reading a response body remains an abort, not invalid JSON',
  { timeout: 1000 },
  async () => {
    const client = createHttpClient({
      timeoutMs: 5,
      fetchImpl: async (_url, { signal }) => ({
        status: 200,
        ok: true,
        json: () => abortableFetch('/ignored', { signal }),
      }),
    });
    await assert.rejects(
      client.get('/tasks'),
      (error) => error instanceof ApiError && error.code === 'ABORTED',
    );
  },
);
