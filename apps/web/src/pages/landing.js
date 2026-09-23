import { I, brand, btn, badge, progress } from '../components/ui.js';

export function landing() {
  return /* HTML */ `<div class="landing landing-v2">
    <div class="announcement">
      AI Sana <span>От бизнес-задачи к первому реальному проекту</span>
      <button data-route="catalog">Открыть каталог ↗</button>
    </div>
    <header class="topbar">
      ${brand()}
      <nav class="topnav">
        <a href="#/catalog">Каталог задач</a><a href="#/dashboard">Для бизнеса</a
        ><a href="#/student">Для студентов</a
        ><button class="text-btn" data-scroll="how">Как это работает</button>
      </nav>
      <div class="head-actions">
        ${btn('Войти', 'login', 'ghost')}${btn('Регистрация ↗', 'register')}
      </div>
    </header>
    <section class="hero-v2">
      <div class="hero-grid" aria-hidden="true"></div>
      <div class="hero-copy">
        <span class="eyebrow">Бизнес × студенты × AI</span>
        <h1><span>Реальные бизнес-задачи.</span><br /><em>Реальный опыт студентов.</em></h1>
        <p>
          AI Sana помогает бизнесу качественно формулировать задачи,<br class="desktop-break" />
          а студенческим командам — находить реальные проекты.
        </p>
        <div class="actions">
          ${btn('Разместить задачу ' + I('arrow', 17), 'create')}${btn('Смотреть каталог ↗', 'catalog', 'ghost')}
        </div>
        <button class="scroll-cue" data-scroll="product-preview">
          Познакомьтесь с платформой <span>↓</span>
        </button>
      </div>
    </section>
    <section class="product-section" id="product-preview">
      <div class="product-window reveal">
        <div class="window-top">
          <span class="window-dots" aria-hidden="true">● ● ●</span
          ><span>AI Sana / Рабочее пространство</span><span class="demo-ribbon">Демо</span>
        </div>
        <div class="preview-workspace">
          <div class="preview-sidebar">
            ${brand()}<span class="preview-nav">${I('grid')} Обзор</span
            ><span class="preview-nav selected">${I('list')} Мои задачи</span
            ><span class="preview-nav">${I('users')} Отклики</span
            ><button class="text-btn" data-route="dashboard">Открыть пространство ↗</button>
          </div>
          <div class="preview-main">
            <div class="preview-heading">
              <div>
                <span class="eyebrow">От идеи к действию</span>
                <h2>Задача, понятная команде.</h2>
              </div>
              ${badge('Сформировано с AI', 'soft')}
            </div>
            <div class="preview-columns">
              <div class="preview-task">
                <div class="row">${badge('FinTech')}${badge('Analytics')}</div>
                <h3>Анализ оттока клиентов</h3>
                <p>
                  Выявить причины ухода клиентов и построить модель, которая помогает прогнозировать
                  риск оттока.
                </p>
                <div class="preview-line">
                  <span>Данные и материалы</span><strong>20 / 20 ✓</strong>
                </div>
                <div class="preview-line">
                  <span>Ожидаемый результат</span><strong>15 / 15 ✓</strong>
                </div>
                <div class="preview-line">
                  <span>Критерии успеха</span><strong>15 / 15 ✓</strong>
                </div>
              </div>
              <div class="preview-rating">
                <span>Готовность задачи</span>
                <div><strong data-count="91">91</strong><small>/100</small></div>
                ${progress(91)}${badge('Приоритетная', 'priority')}
                <p>Всё готово для следующего шага.</p>
                ${btn('Открыть карточку ↗', 'editor', 'soft small')}
              </div>
            </div>
            <div class="preview-note">
              ${I('check', 16)} Чёткая задача. Измеримый результат. Подходящая команда.
            </div>
          </div>
        </div>
      </div>
    </section>
    <section class="landing-stats reveal">
      <div><strong data-count="48">48</strong><span>Активных задач</span></div>
      <div><strong data-count="24">24</strong><span>Команды</span></div>
      <div><strong data-count="17">17</strong><span>Выбранных решений</span></div>
    </section>
    <section class="flow-v2" id="how">
      <div class="flow-title reveal">
        <span class="eyebrow">Как это работает</span>
        <h2>Хорошие идеи<br /><em>становятся проектами.</em></h2>
      </div>
      <div class="flow-cards">
        ${[
          ['Описание задачи', 'Расскажите о проблеме своими словами.', 'create'],
          ['AI-уточнение', 'Ответьте на вопросы и дополните контекст.', 'clarify'],
          ['Рейтинг', 'Проверьте готовность и улучшите описание.', 'editor'],
          ['Каталог', 'Сделайте задачу доступной для команд.', 'catalog'],
          ['Предложения команд', 'Сравните идеи и подходы к решению.', 'proposals'],
          ['Выбор бизнеса', 'Выберите команду для вашего проекта.', 'proposals'],
        ]
          .map(
            ([t, d, r], i) =>
              /* HTML */ `<button class="flow-card reveal" data-route="${r}">
                <span class="flow-number">0${i + 1}</span>
                <h3>${t}</h3>
                <p>${d}</p>
                <span class="flow-arrow">↗</span>
              </button>`,
          )
          .join('')}
      </div>
    </section>
    <footer class="landing-footer">
      ${brand()}<span>Реальные задачи. Совместные решения.</span
      ><button class="text-btn" data-route="catalog">Каталог задач ↗</button>
    </footer>
  </div>`;
}
