import { esc } from '../shared/html.js';
import { getTask, level, selectTasks } from '../features/tasks/model.js';
import { I, badge, btn, tags } from '../components/ui.js';
import { layout } from '../components/layout.js';
import { fieldLabels } from '../services/ai/types.js';
import { canProposeSolution } from '../features/proposals/permissions.js';

function catalogStatus(state) {
  if (state.catalog.status === 'error') {
    return /* HTML */ `<div class="card empty" role="alert" style="grid-column:1/-1">
      <h3>Не удалось загрузить задачи</h3>
      <p>${esc(state.catalog.error || 'Проверьте подключение и попробуйте снова.')}</p>
      ${btn('Попробовать снова', 'retry-catalog', 'ghost')}
    </div>`;
  }

  if (state.catalog.status === 'idle' || state.catalog.status === 'loading') {
    return '<div class="card empty" role="status" style="grid-column:1/-1">Загружаем задачи…</div>';
  }

  return '';
}

function catalogRole(state) {
  return state.auth?.status === 'authenticated' ? state.auth.profile?.role || 'student' : 'student';
}

function catalogCard(task) {
  const scored = Number.isFinite(task.score);
  return /* HTML */ `<article class="card catalog-card">
    <div class="row" style="justify-content:space-between">
      ${scored ? `<span class="catalog-score">${esc(task.score)}<small style="font-size:12px;color:#9aa7b9">/100</small></span>` : '<span class="muted">Нет оценки</span>'}
      ${scored ? badge(...level(task.score)) : ''}
    </div>
    <h3>${esc(task.title)}</h3>
    <p>
      ${task.industry ? `<strong style="color:#5363d2">${esc(task.industry)}</strong> · ` : ''}${esc(task.description)}
    </p>
    ${tags(task.tags)}
    <div class="bottom">
      <span class="muted">Опубликована</span>
      ${btn('Посмотреть задачу', `detail?id=${encodeURIComponent(task.id)}`, 'ghost small')}
    </div>
  </article>`;
}

export function catalog(state) {
  const filters = state.filters;
  const list = selectTasks(state);
  const status = catalogStatus(state);
  const options = (key) =>
    [...new Set(state.catalog.items.map((task) => task[key]).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'ru'))
      .map(
        (value) =>
          `<option value="${esc(value)}" ${filters[key] === value ? 'selected' : ''}>${esc(value)}</option>`,
      )
      .join('');

  return layout(
    /* HTML */ `<span class="eyebrow">Открытые проекты</span>
      <h1 class="page-title">Каталог бизнес-задач</h1>
      <p class="sub">Найдите реальную задачу и предложите своё решение.</p>
      <div class="catalog-controls">
        <input
          id="search"
          class="input"
          placeholder="Поиск задач..."
          aria-label="Поиск задач"
          value="${esc(filters.search)}"
        />
        <select class="select" data-filter="industry" aria-label="Отрасль">
          <option value="">Отрасль</option>
          ${options('industry')}
        </select>
        <select class="select" data-filter="direction" aria-label="Направление">
          <option value="">Направление</option>
          ${options('direction')}
        </select>
        <select class="select" data-filter="level" aria-label="Уровень готовности">
          <option value="">Уровень готовности</option>
          ${['Приоритетная', 'Готовая', 'Рабочая', 'Черновик', 'Нет оценки'].map((value) => /* HTML */ `<option ${filters.level === value ? 'selected' : ''}>${value}</option>`).join('')}
        </select>
      </div>
      <div class="sortbar">
        <span>${status ? 'Каталог задач' : `Найдено задач: <strong>${list.length}</strong>`}</span>
        <div class="row">
          <select class="select" data-filter="sort" aria-label="Сортировка" style="width:auto">
            <option value="rating" ${filters.sort === 'rating' ? 'selected' : ''}>
              Сортировка: по рейтингу
            </option>
            <option value="new" ${filters.sort === 'new' ? 'selected' : ''}>Сначала новые</option>
          </select>
        </div>
      </div>
      <div class="catalog-grid">
        ${status || list.map(catalogCard).join('') || `<div class="card empty" style="grid-column:1/-1">${state.catalog.items.length ? 'По вашему запросу задач не найдено. Попробуйте другие фильтры.' : 'Пока нет опубликованных задач. Здесь появятся задачи пользователей после публикации.'}</div>`}
      </div>`,
    'catalog',
    catalogRole(state),
    state.auth,
  );
}

export function detail(state) {
  const role = catalogRole(state);
  const canOffer = canProposeSolution(state.auth);
  const task = getTask(state);
  const backLink = '<button class="back-link" data-route="catalog">← К каталогу задач</button>';
  const status = catalogStatus(state);

  if (status) return layout(`${backLink}${status}`, 'detail', role, state.auth);
  if (!task) {
    return layout(
      `${backLink}<div class="card empty"><h1>Задача не найдена</h1><p>Возможно, она была удалена. Выберите другую задачу в каталоге.</p></div>`,
      'detail',
      role,
      state.auth,
    );
  }

  const scored = Number.isFinite(task.score);
  const [readiness, badgeClass] = scored ? level(task.score) : ['Нет оценки', 'soft'];
  const sections = Object.entries(fieldLabels)
    .filter(([key]) => key !== 'title' && key !== 'businessContact' && task.card?.[key])
    .map(
      ([key, label]) =>
        /* HTML */ `<section class="info-section">
          <h3>${esc(label)}</h3>
          <p>${esc(task.card[key])}</p>
        </section>`,
    )
    .join('');

  return layout(
    `${backLink}<div class="detail-grid${canOffer ? '' : ' detail-grid--single'}" style="margin-top:0">
    <article class="card detail-card">
      <div class="row">
        ${task.industry ? badge(esc(task.industry)) : ''}
        ${badge(scored ? `${esc(task.score)}/100 · ${readiness}` : readiness, badgeClass)}
        ${task.direction ? `<span class="muted right">${esc(task.direction)}</span>` : ''}
      </div>
      <h1>${esc(task.title)}</h1>
      ${tags(task.tags)}
      <section class="info-section"><h3>Описание задачи</h3><p>${esc(task.description)}</p></section>
      ${sections}
    </article>
    ${
      canOffer
        ? `<aside class="card side-cta">
      <h3>Хотите решить эту задачу?</h3>
      <p>Расскажите бизнесу, как ваша команда предлагает подойти к решению.</p>
      ${btn('Предложить решение', 'offer')}
      ${btn(state.saved ? 'Сохранено ✓' : I('bookmark', 15) + ' Сохранить', 'save-task', 'ghost')}
    </aside>`
        : ''
    }
  </div>`,
    'detail',
    role,
    state.auth,
  );
}
