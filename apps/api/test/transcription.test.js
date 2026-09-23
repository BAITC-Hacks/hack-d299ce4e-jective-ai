import assert from 'node:assert/strict';
import test from 'node:test';
import { Readable } from 'node:stream';
import { EventEmitter } from 'node:events';
import { createApp } from '../src/app.js';
import {
  createTranscriptionService,
  MAX_AUDIO_BYTES,
} from '../src/modules/task-analysis/transcription.js';

async function request(app, body, type = 'audio/webm;codecs=opus', method = 'POST') {
  const req = Object.assign(Readable.from([body]), {
    url: '/api/ai/task-analysis/transcribe',
    method,
    headers: { 'content-type': type },
  });
  const res = new EventEmitter();
  res.writeHead = (status, headers) => Object.assign(res, { status, headers });
  res.end = (body) => {
    res.body = body;
    res.writableEnded = true;
  };
  await app(req, res);
  return { status: res.status, headers: res.headers, json: JSON.parse(res.body) };
}

test('audio endpoint sends a multipart file to OpenAI and returns text without the secret', async () => {
  const service = createTranscriptionService({
    apiKey: 'test-secret',
    fetchImpl: async (url, options) => {
      assert.equal(url, 'https://api.openai.com/v1/audio/transcriptions');
      assert.equal(options.headers.Authorization, 'Bearer test-secret');
      assert.equal(options.body.get('model'), 'gpt-4o-mini-transcribe');
      assert.equal(options.body.get('file').name, 'recording.webm');
      assert.equal(await options.body.get('file').text(), 'audio');
      return Response.json({ text: 'Распознанное описание' });
    },
  });
  const response = await request(
    createApp({ transcriptionService: service }),
    Buffer.from('audio'),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(response.json, { data: { text: 'Распознанное описание' } });
  assert.ok(!JSON.stringify(response).includes('test-secret'));
});

test('invalid uploads never call OpenAI', async () => {
  let calls = 0;
  const app = createApp({
    transcriptionService: createTranscriptionService({
      apiKey: 'test',
      fetchImpl: async () => {
        calls++;
      },
    }),
  });
  for (const [body, type, method, status] of [
    [Buffer.from('x'), 'text/plain', 'POST', 415],
    [Buffer.alloc(0), 'audio/webm', 'POST', 400],
    [Buffer.alloc(MAX_AUDIO_BYTES + 1), 'audio/webm', 'POST', 413],
    [Buffer.from('x'), 'audio/webm', 'GET', 405],
  ]) {
    assert.equal((await request(app, body, type, method)).status, status);
  }
  assert.equal(calls, 0);
});

test('missing keys, provider errors, empty transcripts and timeouts are actionable', async () => {
  await assert.rejects(
    createTranscriptionService({ apiKey: '' }).transcribe(Buffer.from('a'), 'audio/webm'),
    { code: 'AI_NOT_CONFIGURED' },
  );
  for (const [response, code] of [
    [Response.json({ text: '' }), 'NO_SPEECH'],
    [Response.json({}, { status: 429 }), 'AI_RATE_LIMIT'],
    [Response.json({}, { status: 401 }), 'AI_AUTH_ERROR'],
    [new Response('{'), 'TRANSCRIPTION_FAILED'],
  ]) {
    await assert.rejects(
      createTranscriptionService({ apiKey: 'test', fetchImpl: async () => response }).transcribe(
        Buffer.from('a'),
        'audio/webm',
      ),
      { code },
    );
  }
  const service = createTranscriptionService({
    apiKey: 'test',
    timeoutMs: 5,
    fetchImpl: (_url, { signal }) =>
      new Promise((_resolve, reject) =>
        signal.addEventListener('abort', () => reject(new Error('Aborted'))),
      ),
  });
  await assert.rejects(service.transcribe(Buffer.from('a'), 'audio/webm'), { code: 'AI_TIMEOUT' });
});
