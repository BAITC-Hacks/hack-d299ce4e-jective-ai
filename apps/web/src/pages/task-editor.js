import { esc } from '../shared/html.js';
import { level } from '../features/tasks/model.js';
import { I, btn, badge, tags, progress } from '../components/ui.js';
import { layout } from '../components/layout.js';

const stepper = (n) =>
  /* HTML */ `<div class="stepper">
    ${['Описание', 'Уточнение', 'Карточка', 'Публикация'].map((s, i) => `${i ? '<span class="step-line"></span>' : ''}<span class="step-item ${i + 1 === n ? 'current' : i + 1 < n ? 'done' : ''}"><i>${i + 1 < n ? '✓' : i + 1}</i>${s}</span>`).join('')}
  </div>`;

export function create(state) {
  return layout(
    /* HTML */ `<div class="narrow">
      ${stepper(1)}<span class="eyebrow">Шаг 1 из 4</span>
      <h1 class="page-title">Опишите вашу бизнес-задачу</h1>
      <p class="sub">
        Не беспокойтесь о структуре. Опишите проблему своими словами — AI поможет оформить её
        правильно.
      </p>
      <div class="card form-card">
        <div class="field">
          <label for="description">Что вы хотите решить?</label
          ><textarea
            id="description"
            class="textarea"
            placeholder="У нас высокий отток клиентов. Хотим понять причины и научиться определять клиентов с высоким риском ухода..."
          >
${esc(state.description)}</textarea>
        </div>
        <p class="hint">
          Можно начать с нескольких предложений. Следующие экраны демонстрируют, как задача
          оформляется после уточнения.
        </p>
        <div class="actions" style="justify-content:flex-end">
          ${btn(I('spark', 16) + ' Проанализировать с AI', 'analyze')}
        </div>
      </div>
    </div>`,
    'create',
    'business',
  );
}

const questions = [
  ['Какие данные о клиентах доступны?', '+20 баллов'],
  ['Какие именно клиенты сталкиваются с этой проблемой?', '+10 баллов'],
  ['Какой результат вы ожидаете получить?', '+10 баллов'],
  ['Есть ли технические или временные ограничения?', '+10 баллов'],
];

export function clarify(state) {
  return layout(
    /* HTML */ `<div class="narrow">
      ${stepper(2)}<span class="eyebrow">Шаг 2 из 4</span>
      <h1 class="page-title">Уточним несколько деталей</h1>
      <p class="sub">
        Чтобы задача была понятна студенческим командам, ответьте на несколько вопросов.
      </p>
      <div class="card" style="padding:23px;margin-top:25px">
        <div class="row" style="justify-content:space-between;margin-bottom:13px">
          <strong>Текущая готовность</strong><span class="score">32/100</span>
        </div>
        ${progress(32)}
      </div>
      <div class="card" style="margin-top:17px">
        ${questions
          .map(
            ([q, b], i) =>
              /* HTML */ `<div class="question">
                <div class="question-head">
                  <h3>${q}</h3>
                  ${badge(b, 'soft')}
                </div>
                <textarea class="textarea" data-answer="${i}" placeholder="Напишите ответ...">
${esc(state.answers[i] || '')}</textarea>
              </div>`,
          )
          .join('')}
      </div>
      <div class="actions" style="justify-content:space-between;margin-top:22px">
        ${btn('Назад', 'create', 'ghost')}${btn('Сформировать карточку ' + I('arrow', 16), 'editor')}
      </div>
    </div>`,
    'clarify',
    'business',
  );
}

function rating(state) {
  const ratingRows = [
    ['Контекст и потребность', '20/20 ✓'],
    ['Данные и материалы', '20/20 ✓'],
    ['Ожидаемый результат', '15/15 ✓'],
    ['Критерии успеха', state.rating > 76 ? '15/15 ✓' : '0/15'],
    ['Ограничения', '10/10 ✓'],
    ['Пользователи', '6/10'],
    ['Связь с бизнесом', '5/10'],
  ];
  return /* HTML */ `<aside class="card rating">
    <h3>Готовность задачи</h3>
    <div class="score-large">${state.rating}<small>/100</small></div>
    ${progress(state.rating)}${badge(...level(state.rating))}
    <div class="rating-list">
      ${ratingRows.map(([a, b]) => /* HTML */ `<div class="rating-line"><span>${a}</span><strong>${b}</strong></div>`).join('')}
    </div>
    ${
      state.rating < 90
        ? /* HTML */ `<div class="callout">
            <strong>${I('spark', 15)} Повысить рейтинг</strong>
            <p>Добавьте измеримые критерии успеха.</p>
            <div class="row" style="justify-content:space-between">
              ${badge('+15 баллов', 'soft')}${btn('Дополнить', 'improve', 'ghost small')}
            </div>
          </div>`
        : /* HTML */ `<div class="callout">
            <strong>Отличная готовность</strong>
            <p>Задача подробно описана и готова к публикации.</p>
          </div>`
    }
  </aside>`;
}

export function editor(state) {
  return layout(
    `${stepper(3)}<div class="row" style="justify-content:space-between;flex-wrap:wrap"><div><span class="eyebrow">Шаг 3 из 4</span><h1 class="page-title">Карточка задачи</h1><p class="sub">Проверьте информацию перед публикацией.</p></div>${badge(I('spark', 13) + ' Сформировано с помощью AI', 'soft')}</div><div class="editor-grid"><div class="card editor-card"><div class="row">${badge('FinTech')}${badge('Черновик', 'draft')}</div><h2>Анализ и прогнозирование оттока клиентов</h2>${tags(['Machine Learning', 'Analytics'])}${Object.entries(
      state.fields,
    )
      .map(
        ([key, val]) =>
          /* HTML */ `<section class="info-section">
            <div class="edit-row">
              <div>
                <h3>${esc(key)}</h3>
                <p>${esc(val)}</p>
              </div>
              <button
                class="icon-btn"
                data-edit="${esc(key)}"
                aria-label="Редактировать: ${esc(key)}"
              >
                ${I('edit', 15)}
              </button>
            </div>
          </section>`,
      )
      .join(
        '',
      )}</div>${rating(state)}</div><div class="editor-actions">${btn('Сохранить черновик', 'save-draft', 'ghost')}${btn('Опубликовать задачу ' + I('arrow', 16), 'publish')}</div>`,
    'editor',
    'business',
  );
}
