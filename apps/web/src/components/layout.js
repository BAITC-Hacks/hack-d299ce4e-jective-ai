import { I, brand, badge } from './ui.js';
import { esc } from '../shared/html.js';

export function navItems(role) {
  return role === 'business'
    ? [
        ['dashboard', 'Обзор', 'grid'],
        ['my-tasks', 'Мои задачи', 'list'],
        ['create', 'Создать задачу', 'plus'],
        ['proposals', 'Отклики', 'users'],
        ['catalog', 'Каталог', 'search'],
        ['profile', 'Профиль', 'team'],
      ]
    : [
        ['student', 'Обзор', 'grid'],
        ['catalog', 'Каталог задач', 'search'],
        ['my-proposals', 'Мои отклики', 'list'],
        ['team', 'Моя команда', 'users'],
        ['profile', 'Профиль', 'team'],
      ];
}
export function layout(content, page, role = 'business', auth = null) {
  const signedIn = auth?.status === 'authenticated' && auth.user && auth.profile;
  if (signedIn) role = auth.profile.role;
  const fullName = signedIn ? auth.profile.full_name : 'Гость';
  const roleLabel = signedIn ? (role === 'business' ? 'Бизнес' : 'Студент') : 'Без аккаунта';
  const initials = signedIn
    ? fullName
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => Array.from(part)[0] || '')
        .join('')
        .toLocaleUpperCase('ru')
    : 'Г';
  const items = navItems(role);
  return /* HTML */ `<div class="shell">
    <aside class="sidebar">
      ${brand()}
      <div class="side-label">Рабочее пространство</div>
      <nav class="side-nav">
        ${items.map(([r, t, i]) => /* HTML */ `<button data-route="${r}" class="${page === r ? 'active' : ''}">${I(i)} ${t}</button>`).join('')}
      </nav>
      <div class="side-foot">
        <div class="account">
          <span class="avatar">${esc(initials)}</span>
          <div><strong>${esc(fullName)}</strong><small>${roleLabel}</small></div>
        </div>
        ${signedIn ? `<button class="text-btn" data-action="logout" ${auth.busy ? 'disabled' : ''}>${I('logout', 15)} Выйти</button>` : '<button class="text-btn" data-route="login">Войти</button>'}
      </div>
    </aside>
    <main class="main">
      <header class="main-head">
        <span class="crumb">Рабочее пространство / <strong>${pageTitle(page)}</strong></span>
        <div class="row">
          ${badge('Демо-задачи', 'soft')}
          <div class="header-account">
            <strong>${esc(fullName)}</strong><small>${roleLabel}</small>
          </div>
          <span class="user-dot" title="${esc(fullName)}">${esc(initials)}</span>
          ${signedIn ? `<button class="text-btn header-logout" data-action="logout" ${auth.busy ? 'disabled' : ''}>Выйти</button>` : '<button class="text-btn" data-route="login">Войти</button>'}
        </div>
      </header>
      <div class="content">${content}</div>
    </main>
    <nav class="mobile-nav">
      ${items
        .slice(0, 5)
        .map(
          ([r, t, i]) =>
            /* HTML */ `<button data-route="${r}" class="${page === r ? 'active' : ''}">
              <span>${I(i, 19)}</span>${t}
            </button>`,
        )
        .join('')}
    </nav>
  </div>`;
}
export function pageTitle(r) {
  return (
    {
      dashboard: 'Обзор',
      'my-tasks': 'Мои задачи',
      create: 'Создать задачу',
      clarify: 'Уточнение',
      editor: 'Карточка задачи',
      catalog: 'Каталог',
      detail: 'Задача',
      student: 'Обзор',
      'my-proposals': 'Мои отклики',
      proposals: 'Отклики',
      team: 'Моя команда',
      profile: 'Профиль',
    }[r] || 'AI Sana'
  );
}
