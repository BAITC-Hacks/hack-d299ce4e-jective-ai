import { I, brand, btn } from '../components/ui.js';

export function auth(state, register = false) {
  return /* HTML */ `<div class="auth-wrap">
    <div class="auth-art">
      ${brand()}
      <h2>Реальные задачи.<br />Значимый опыт.</h2>
      <p>
        Пространство, где компании находят свежие идеи, а студенты работают над практическими
        проектами.
      </p>
      <small>AI Sana · демонстрационный прототип</small>
    </div>
    <div class="auth-main">
      <div class="auth-top">${btn('← На главную', 'home', 'ghost small')}</div>
      <form class="auth-form" id="${register ? 'register' : 'login'}-form">
        <span class="eyebrow">AI Sana</span>
        <h1>${register ? 'Создать аккаунт' : 'С возвращением'}</h1>
        <p>
          ${register ? 'Выберите свою роль и начните работу.' : 'Войдите, чтобы продолжить работу с задачами.'}
        </p>
        ${register ? '<div class="field"><label for="name">Имя</label><input id="name" class="input" autocomplete="name" placeholder="Ваше имя" required></div>' : ''}
        <div class="field">
          <label for="email">Email</label
          ><input
            id="email"
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
                  >
                    ${I('brief', 23)}<strong>Я представляю бизнес</strong
                    ><small
                      >Размещайте реальные задачи и находите студенческие команды.</small
                    ></button
                  ><button
                    type="button"
                    class="role ${state.role === 'student' ? 'selected' : ''}"
                    data-role="student"
                  >
                    ${I('team', 23)}<strong>Я студент</strong
                    ><small>Находите бизнес-задачи и предлагайте решения.</small>
                  </button>
                </div>
              </div>`
            : /* HTML */ `<div class="row" style="justify-content:space-between">
                <label class="checkline"><input type="checkbox" /> Запомнить меня</label
                ><button type="button" class="text-btn" data-action="forgot">Забыли пароль?</button>
              </div>`
        }<button class="btn primary" type="submit">
          ${register ? 'Создать аккаунт' : 'Войти'} ${I('arrow', 16)}
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
