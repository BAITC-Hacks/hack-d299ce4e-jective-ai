import { I, brand, badge } from './ui.js';

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
export function layout(content, page, role = 'business') {
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
          <span class="avatar">${role === 'business' ? 'АМ' : 'DW'}</span>
          <div>
            <strong>${role === 'business' ? 'Алия М.' : 'Data Wizards'}</strong
            ><small>${role === 'business' ? 'Бизнес' : 'Студент'}</small>
          </div>
        </div>
        <button class="text-btn" data-route="home">${I('logout', 15)} Выйти</button>
      </div>
    </aside>
    <main class="main">
      <header class="main-head">
        <span class="crumb">Рабочее пространство / <strong>${pageTitle(page)}</strong></span>
        <div class="row">
          ${badge('Демо', 'soft')}<span class="user-dot">${role === 'business' ? 'А' : 'D'}</span>
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
