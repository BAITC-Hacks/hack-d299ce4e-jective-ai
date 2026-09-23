import { btn, I } from './ui.js';
import { esc } from '../shared/html.js';

export function voiceInput(state, target) {
  const voice = state.voice?.target === target ? state.voice : { status: 'idle' };
  const active = ['requesting', 'recording', 'transcribing'].includes(voice.status);
  let controls = btn(
    `${I('mic', 16)} ${voice.status === 'done' ? 'Дополнить голосом' : 'Ввести голосом'}`,
    'voice-start',
    'ghost small',
    `type="button" data-voice-target="${esc(target)}"`,
  );
  if (voice.status === 'recording')
    controls = btn('Остановить и распознать', 'voice-stop', 'primary small', 'type="button"');
  if (['requesting', 'transcribing'].includes(voice.status)) controls = '';
  if (active) controls += btn('Отменить', 'voice-cancel', 'ghost small', 'type="button"');
  if (voice.status === 'error' && voice.canRetry)
    controls += btn('Повторить распознавание', 'voice-retry', 'ghost small', 'type="button"');
  const messages = {
    requesting: 'Разрешите доступ к микрофону в браузере.',
    recording: '● Идёт запись. Говорите — до 2 минут. Затем запись остановится автоматически.',
    transcribing: 'ИИ распознаёт речь...',
    done: 'Текст добавлен. Проверьте его перед продолжением.',
  };
  return `<div class="voice-input"><div class="actions">${controls}</div>${voice.status === 'error' ? `<p role="alert" class="hint">${esc(voice.error)}</p>` : `<p role="status" aria-live="polite" class="hint">${messages[voice.status] || 'После остановки ИИ распознает запись и добавит текст в это поле.'}</p>`}</div>`;
}
