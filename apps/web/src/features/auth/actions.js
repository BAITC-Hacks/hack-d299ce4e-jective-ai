import { btn } from '../../components/ui.js';

/** Demo authentication only. Replace this boundary when real sessions are implemented. */
export function createAuthActions({ store, router, feedback }) {
  return {
    signIn() {
      router.navigate(store.getState().role === 'student' ? 'student' : 'dashboard');
      feedback.toast('Вы вошли в демо-режиме');
    },
    forgot() {
      feedback.modal(
        /* HTML */ `<h2>Восстановление пароля</h2>
          <p>
            Это демонстрационный экран. Восстановление пароля будет доступно после подключения
            авторизации.
          </p>
          <div class="actions">${btn('Понятно', 'close')}</div>`,
      );
    },
  };
}
