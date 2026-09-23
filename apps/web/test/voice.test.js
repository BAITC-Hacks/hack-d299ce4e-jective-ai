import assert from 'node:assert/strict';
import test from 'node:test';
import { createVoiceController } from '../src/features/tasks/voice-controller.js';
import { createStore } from '../src/app/store.js';
import { voiceInput } from '../src/components/voice-input.js';
import { createTranscriptionClient } from '../src/services/ai/transcription.js';

const tick = () => new Promise((resolve) => setImmediate(resolve));
function setup(overrides = {}) {
  let stopped = 0;
  const stream = {
    getTracks: () => [
      {
        stop() {
          stopped++;
        },
      },
    ],
  };
  class Recorder {
    static isTypeSupported(type) {
      return type.startsWith('audio/webm');
    }
    state = 'inactive';
    start() {
      this.state = 'recording';
    }
    stop() {
      this.state = 'inactive';
      queueMicrotask(() => {
        this.ondataavailable({ data: new Blob(['audio']) });
        this.onstop();
      });
    }
  }
  const store = createStore({ description: 'Уже введено', voice: { status: 'idle' } });
  const appended = [];
  const voice = createVoiceController({
    store,
    router: { render() {} },
    Recorder,
    mediaDevices: { getUserMedia: async () => stream },
    appendText: (target, text) => appended.push({ target, text }),
    service: { transcribe: async () => 'Распознанная речь' },
    ...overrides,
  });
  return { store, voice, stream, appended, stopped: () => stopped };
}

test('record, stop and transcribe target the correct field and release the microphone', async () => {
  const s = setup();
  await s.voice.start('answer:q7');
  assert.equal(s.store.getState().voice.status, 'recording');
  assert.match(voiceInput(s.store.getState(), 'answer:q7'), /Остановить и распознать/);
  s.voice.stop();
  await tick();
  assert.deepEqual(s.appended, [{ target: 'answer:q7', text: 'Распознанная речь' }]);
  assert.ok(s.stopped() > 0);
  assert.equal(s.store.getState().voice.status, 'done');
  s.voice.dispose();
});

test('cancel while permission is pending stops a late stream without starting recording', async () => {
  let grant;
  const s = setup({
    mediaDevices: {
      getUserMedia: () =>
        new Promise((resolve) => {
          grant = resolve;
        }),
    },
  });
  const start = s.voice.start('description');
  s.voice.cancel();
  grant(s.stream);
  await start;
  assert.equal(s.stopped(), 1);
  assert.equal(s.store.getState().voice.status, 'idle');
  assert.deepEqual(s.appended, []);
});

test('navigation cancels transcription and ignores late results', async () => {
  let finish, signal;
  const s = setup({
    service: {
      transcribe: (_blob, provided) => {
        signal = provided;
        return new Promise((resolve) => {
          finish = resolve;
        });
      },
    },
  });
  await s.voice.start('description');
  s.voice.stop();
  await tick();
  assert.equal(s.store.getState().voice.status, 'transcribing');
  s.voice.cancel();
  assert.equal(signal.aborted, true);
  finish('Поздний ответ');
  await tick();
  assert.deepEqual(s.appended, []);
});

test('transcription failure retains audio for retry without overwriting typed text', async () => {
  let calls = 0;
  const s = setup({
    service: {
      transcribe: async () => {
        if (++calls === 1) throw new Error('Timeout');
        return 'Текст';
      },
    },
  });
  await s.voice.start('description');
  s.voice.stop();
  await tick();
  assert.equal(s.store.getState().voice.canRetry, true);
  assert.equal(s.store.getState().description, 'Уже введено');
  await s.voice.retry();
  assert.deepEqual(s.appended, [{ target: 'description', text: 'Текст' }]);
  s.voice.dispose();
});

test('permission denial and unsupported browsers keep typing available', async () => {
  for (const options of [
    { mediaDevices: {} },
    {
      mediaDevices: {
        getUserMedia: async () => {
          throw Object.assign(new Error(), { name: 'NotAllowedError' });
        },
      },
    },
  ]) {
    const s = setup(options);
    await s.voice.start('description');
    assert.equal(s.store.getState().voice.status, 'error');
    assert.match(voiceInput(s.store.getState(), 'description'), /role="alert"/);
    assert.equal(s.store.getState().description, 'Уже введено');
    s.voice.dispose();
  }
});

test('recording automatically stops at the duration limit', async () => {
  const s = setup({ maxDurationMs: 5 });
  await s.voice.start('description');
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(s.store.getState().voice.status, 'done');
  assert.ok(s.stopped() > 0);
  s.voice.dispose();
});

test('client uploads binary audio and validates transcription', async () => {
  const blob = new Blob(['audio'], { type: 'audio/webm;codecs=opus' });
  const client = createTranscriptionClient({
    getAccessToken: async () => 'voice-token',
    client: {
      async request(path, options) {
        assert.equal(path, 'ai/task-analysis/transcribe');
        assert.equal(options.body, blob);
        assert.equal(options.headers['Content-Type'], blob.type);
        assert.equal(options.headers.Authorization, 'Bearer voice-token');
        return { text: ' Текст ' };
      },
    },
  });
  assert.equal(await client.transcribe(blob), 'Текст');
  await assert.rejects(
    createTranscriptionClient({
      getAccessToken: async () => 'token',
      client: { request: async () => ({ text: '' }) },
    }).transcribe(blob),
  );
});

test('idle cancellation does not modify state or render', () => {
  const s = setup();
  const before = s.store.getState();
  s.voice.cancel(false);
  assert.equal(s.store.getState(), before);
  s.voice.dispose();
});

test('account changes immediately cancel recognition and ignore a late transcript', async () => {
  let finish, signal;
  const s = setup({
    service: {
      transcribe: (_audio, provided) => {
        signal = provided;
        return new Promise((resolve) => {
          finish = resolve;
        });
      },
    },
  });
  s.store.update((state) => ({ ...state, auth: { user: { id: 'first' } } }));
  await s.voice.start('description');
  s.voice.stop();
  await tick();
  s.store.update((state) => ({ ...state, auth: { user: { id: 'second' } } }));
  assert.equal(signal.aborted, true);
  assert.equal(s.store.getState().voice.status, 'idle');
  finish('Private transcript');
  await tick();
  assert.deepEqual(s.appended, []);
  s.voice.dispose();
});

test('transcription without a session never uploads audio', async () => {
  let uploads = 0;
  const client = createTranscriptionClient({
    client: {
      request() {
        uploads++;
      },
    },
  });
  await assert.rejects(client.transcribe(new Blob(['audio'])), /Войдите/);
  assert.equal(uploads, 0);
});
