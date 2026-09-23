import { esc } from './html.js';
import { btn } from '../components/ui.js';

export function createFeedback({ overlay, toastElement }) {
  let toastTimer;
  let previousFocus;

  function closeModal() {
    overlay.innerHTML = '';
    previousFocus?.focus();
    previousFocus = undefined;
  }

  function modal(content) {
    previousFocus = document.activeElement;
    overlay.innerHTML = /* HTML */ `<div class="modal-back" data-close="1">
      <div class="modal" role="dialog" aria-modal="true">${content}</div>
    </div>`;
    overlay.querySelector('input,textarea,button')?.focus();
  }

  return {
    modal,
    closeModal,
    toast(message) {
      toastElement.textContent = message;
      toastElement.classList.add('visible');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toastElement.classList.remove('visible'), 3300);
    },
    success(title, body, button, action) {
      modal(
        /* HTML */ `<div class="success">
          <div class="success-icon">✓</div>
          <h2>${esc(title)}</h2>
          <p>${esc(body)}</p>
          ${btn(esc(button), action)}
        </div>`,
      );
    },
    dispose() {
      clearTimeout(toastTimer);
      closeModal();
    },
  };
}
