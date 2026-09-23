import { I, brand, btn } from '../components/ui.js';
import { esc } from '../shared/html.js';

export function auth(state, register = false) {
  const session = state.auth || {};
  const disabled = session.busy || !session.configured;
  const error = session.error || '';
  const notice =
    session.notice || (!session.configured ? 'Регистрация и вход временно недоступны.' : '');
  const idleLabel = register ? 'Создать аккаунт' : 'Войти';
  const busyLabel = register ? 'Создаём аккаунт…' : 'Входим…';
  return /* HTML */ `<div class="auth-wrap">
    <div class="auth-art">
      ${brand()}
      <h2>Реальные задачи.<br />Значимый опыт.</h2>
      <p>
        Пространство, где компании находят свежие идеи, а студенты работают над практическими
        проектами.
      </p>
      <small>AI Sana · от идеи к практике</small>
    </div>
    <div class="auth-main">
      <div class="auth-top">${btn('← На главную', 'home', 'ghost small')}</div>
      <form
        class="auth-form"
        id="${register ? 'register' : 'login'}-form"
        aria-busy="${Boolean(session.busy)}"
      >
        <span class="eyebrow">AI Sana</span>
        <h1>${register ? 'Создать аккаунт' : 'С возвращением'}</h1>
        <p>
          ${register ? 'Выберите свою роль и начните работу.' : 'Войдите, чтобы продолжить работу с задачами.'}
        </p>
        ${register ? '<div class="field"><label for="name">Имя</label><input id="name" name="full_name" class="input" autocomplete="name" placeholder="Ваше имя" maxlength="120" required></div>' : ''}
        <div class="field">
          <label for="email">Email</label
          ><input
            id="email"
            name="email"
            type="email"
            class="input"
            autocomplete="email"
            placeholder="name@example.com"
            required
          />
        </div>
        <div class="field">
          <label for="password">Пароль</label
          ><input
            id="password"
            name="password"
            type="password"
            class="input"
            autocomplete="${register ? 'new-password' : 'current-password'}"
            placeholder="Введите пароль"
            required
            minlength="6"
          />
        </div>
        ${
          register
            ? /* HTML */ `<div class="field">
                <label>Ваша роль</label>
                <div class="role-grid">
                  <button
                    type="button"
                    class="role ${state.role === 'business' ? 'selected' : ''}"
                    data-role="business"
                    aria-pressed="${state.role === 'business'}"
                    data-auth-control
                    ${disabled ? 'disabled' : ''}
                  >
                    ${I('brief', 23)}<strong>Я представляю бизнес</strong
                    ><small
                      >Размещайте реальные задачи и находите студенческие команды.</small
                    ></button
                  ><button
                    type="button"
                    class="role ${state.role === 'student' ? 'selected' : ''}"
                    data-role="student"
                    aria-pressed="${state.role === 'student'}"
                    data-auth-control
                    ${disabled ? 'disabled' : ''}
                  >
                    ${I('team', 23)}<strong>Я студент</strong
                    ><small>Находите бизнес-задачи и предлагайте решения.</small>
                  </button>
                </div>
              </div>`
            : /* HTML */ `<div class="row" style="justify-content:flex-end">
                <button
                  type="button"
                  class="text-btn"
                  data-action="forgot"
                  data-auth-control
                  ${disabled ? 'disabled' : ''}
                >
                  Забыли пароль?
                </button>
              </div>`
        }
        <div
          id="auth-message"
          data-auth-message
          class="auth-message auth-error"
          role="alert"
          ${error ? '' : 'hidden'}
        >
          ${esc(error)}
        </div>
        <div
          id="auth-notice"
          data-auth-notice
          class="auth-message auth-notice"
          role="status"
          ${notice ? '' : 'hidden'}
        >
          ${esc(notice)}
        </div>
        <button
          type="button"
          class="text-btn"
          data-action="retry-auth"
          data-auth-retry
          data-auth-control
          ${session.status === 'error' ? '' : 'hidden'}
          ${disabled ? 'disabled' : ''}
        >
          Повторить подключение
        </button>
        <button
          id="auth-submit"
          data-auth-submit
          data-auth-control
          data-idle-label="${idleLabel}"
          data-busy-label="${busyLabel}"
          class="btn primary"
          type="submit"
          ${disabled ? 'disabled' : ''}
        >
          ${session.busy ? busyLabel : idleLabel} ${I('arrow', 16)}
        </button>
        <div class="auth-under">
          ${register ? 'Уже есть аккаунт?' : 'Нет аккаунта?'}
          <a href="#/${register ? 'login' : 'register'}"
            >${register ? 'Войти' : 'Зарегистрироваться'}</a
          >
        </div>
      </form>
    </div>
  </div>`;
}
