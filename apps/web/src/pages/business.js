import { I, btn, stat } from '../components/ui.js';
import { layout } from '../components/layout.js';
import { taskRow } from '../components/task-row.js';

export function dashboard(state) {
  return layout(
    /* HTML */ `<div
        class="row"
        style="justify-content:space-between;align-items:end;flex-wrap:wrap"
      >
        <div>
          <span class="eyebrow">Панель бизнеса</span>
          <h1 class="page-title">Добро пожаловать, Алия!</h1>
          <p class="sub">Управляйте своими задачами и предложениями команд.</p>
        </div>
        ${btn(I('plus', 16) + ' Создать задачу', 'create')}
      </div>
      <div class="stats">
        ${stat(4, 'Всего задач', 'list')}${stat(state.published ? 4 : 3, 'Опубликовано', 'check')}${stat(12, 'Откликов', 'users')}${stat(state.selected ? 2 : 1, 'Команда выбрана', 'team')}
      </div>
      <div class="section-head">
        <h2 class="section-title">Мои задачи</h2>
        <button class="text-btn" data-route="my-tasks">Смотреть все →</button>
      </div>
      <div class="task-list">
        ${taskRow('Анализ оттока клиентов', 'FinTech', 82, 'Опубликована', '6 откликов', true)}${taskRow('AI-помощник поддержки', 'Telecom', 54, 'Черновик', '', false)}${state.published ? taskRow('Анализ и прогнозирование оттока клиентов', 'FinTech', state.rating, 'Опубликована', '0 откликов', true, 5) : ''}
      </div>`,
    'dashboard',
    'business',
  );
}

export function myTasks(state) {
  return layout(
    /* HTML */ `<div class="row" style="justify-content:space-between">
        <div>
          <h1 class="page-title">Мои задачи</h1>
          <p class="sub">Следите за задачами на каждом этапе.</p>
        </div>
        ${btn(I('plus', 16) + ' Создать задачу', 'create')}
      </div>
      <div class="task-list" style="margin-top:30px">
        ${taskRow('Анализ оттока клиентов', 'FinTech', 82, 'Опубликована', '6 откликов', true)}${taskRow('AI-помощник поддержки', 'Telecom', 54, 'Черновик', '', false)}${taskRow('Прогнозирование спроса', 'Retail', 94, 'Опубликована', '12 откликов', true, 1)}${state.published ? taskRow('Анализ и прогнозирование оттока клиентов', 'FinTech', state.rating, 'Опубликована', '0 откликов', true, 5) : ''}
      </div>`,
    'my-tasks',
    'business',
  );
}
