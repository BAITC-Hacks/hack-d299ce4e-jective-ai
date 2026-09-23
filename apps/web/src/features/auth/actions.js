import { btn } from '../../components/ui.js';

/** Update feedback in place; passwords never enter application state. */
export function syncAuthForm(auth, documentRef = document) {
  const form = documentRef.querySelector('.auth-form');
  if (!form) return false;
  const message = form.querySelector('#auth-message');
  const notice = form.querySelector('#auth-notice');
  if (message) {
    const error = auth.error || (!auth.configured ? 'Регистрация и вход временно недоступны.' : '');
    message.textContent = error;
    message.hidden = !error;
  }
  if (notice) {
    notice.textContent = auth.notice;
    notice.hidden = !auth.notice;
  }
  form.setAttribute('aria-busy', String(auth.busy));
  for (const button of form.querySelectorAll('[data-auth-control]'))
    button.disabled = auth.busy || !auth.configured;
  const submit = form.querySelector('#auth-submit');
  if (submit) submit.textContent = auth.busy ? submit.dataset.busyLabel : submit.dataset.idleLabel;
  const retry = form.querySelector('[data-auth-retry]');
  if (retry) retry.hidden = auth.status !== 'error';
  return true;
}

export function createAuthActions({ authController, store, feedback }) {
  return {
    async submit(form) {
      const values = new FormData(form);
      const credentials = {
        email: String(values.get('email') || ''),
        password: String(values.get('password') || ''),
      };
      const success =
        form.id === 'register-form'
          ? await authController.register({
              ...credentials,
              fullName: String(values.get('full_name') || ''),
              role: store.getState().role,
            })
          : await authController.login(credentials);
      if (success) {
        const password = form.querySelector('[name="password"]');
        if (password) password.value = '';
      }
    },
    logout: () => authController.logout(),
    retry: () => authController.retry(),
    forgot() {
      feedback.modal(
        /* HTML */ `<h2>Восстановление доступа</h2>
          <p>Для восстановления пароля обратитесь к администратору платформы.</p>
          <div class="actions">${btn('Понятно', 'close')}</div>`,
      );
    },
  };
}
