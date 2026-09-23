import { createTranscriptionClient } from '../../services/ai/transcription.js';

export function createVoiceController({
  store,
  router,
  appendText,
  mediaDevices = globalThis.navigator?.mediaDevices,
  Recorder = globalThis.MediaRecorder,
  service = createTranscriptionClient(),
  maxDurationMs = 120000,
}) {
  let session = 0;
  let recorder, stream, timer, request, audio;
  const current = () => store.getState().voice || { status: 'idle', target: '' };
  const show = (patch) => {
    store.update((state) => ({ ...state, voice: { ...current(), ...patch } }));
    router.render();
  };
  const release = () => {
    clearTimeout(timer);
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
  };
  function cancel(render = true) {
    session++;
    request?.abort();
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    release();
    recorder = null;
    audio = null;
    store.update((state) => ({ ...state, voice: { status: 'idle', target: '' } }));
    if (render) router.render();
  }
  async function transcribe(id, target) {
    request = new AbortController();
    show({ status: 'transcribing', error: '' });
    try {
      const text = await service.transcribe(audio, request.signal);
      if (id !== session) return;
      appendText(target, text);
      audio = null;
      show({ status: 'done', error: '' });
    } catch (error) {
      if (id === session)
        show({
          status: 'error',
          error: error.message || 'Не удалось распознать речь.',
          canRetry: Boolean(audio),
        });
    }
  }
  async function start(target) {
    if (['requesting', 'recording', 'transcribing'].includes(current().status)) return;
    cancel(false);
    const id = session;
    show({ target, status: 'requesting', error: '', canRetry: false });
    try {
      if (!mediaDevices?.getUserMedia || !Recorder)
        throw new Error(
          'Микрофон недоступен. Откройте сайт по HTTPS или localhost в браузере с поддержкой записи звука.',
        );
      const acquired = await mediaDevices.getUserMedia({ audio: true });
      if (id !== session) {
        acquired.getTracks().forEach((track) => track.stop());
        return;
      }
      stream = acquired;
      const mimeType = [
        'audio/webm;codecs=opus',
        'audio/mp4',
        'audio/ogg;codecs=opus',
        'audio/webm',
      ].find((type) => Recorder.isTypeSupported(type));
      if (!mimeType)
        throw new Error(
          'Браузер не поддерживает нужный формат записи. Попробуйте Chrome, Edge или Safari.',
        );
      recorder = new Recorder(stream, { mimeType });
      const chunks = [];
      let size = 0;
      recorder.ondataavailable = (event) => {
        if (id !== session) return;
        size += event.data.size;
        if (size > 10 * 1024 * 1024) {
          cancel(false);
          show({
            target,
            status: 'error',
            error: 'Запись слишком большая. Запишите более короткое сообщение.',
            canRetry: false,
          });
          return;
        }
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onerror = () => {
        if (id !== session) return;
        cancel(false);
        show({
          target,
          status: 'error',
          error: 'Запись прервалась. Проверьте микрофон и попробуйте ещё раз.',
          canRetry: false,
        });
      };
      recorder.onstop = () => {
        if (id !== session) return;
        release();
        audio = new Blob(chunks, { type: mimeType });
        if (!audio.size) {
          audio = null;
          show({ status: 'error', error: 'Запись пуста. Попробуйте ещё раз.', canRetry: false });
          return;
        }
        void transcribe(id, target);
      };
      recorder.start(1000);
      show({ status: 'recording' });
      timer = setTimeout(stop, maxDurationMs);
    } catch (error) {
      if (id !== session) return;
      release();
      const messages = {
        NotAllowedError:
          'Доступ к микрофону запрещён. Разрешите его в настройках браузера и попробуйте снова.',
        NotFoundError: 'Микрофон не найден. Подключите его и попробуйте снова.',
        NotReadableError:
          'Не удалось включить микрофон. Возможно, его использует другое приложение.',
      };
      show({ status: 'error', error: messages[error.name] || error.message, canRetry: false });
    }
  }
  function stop() {
    if (recorder?.state === 'recording') {
      recorder.stop();
      release();
    }
  }
  return {
    start,
    stop,
    cancel,
    retry: () => {
      if (audio && current().status === 'error') return transcribe(session, current().target);
    },
    dispose: () => cancel(false),
  };
}
