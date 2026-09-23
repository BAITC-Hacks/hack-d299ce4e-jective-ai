import { btn, badge, tags } from '../components/ui.js';
import { layout } from '../components/layout.js';

export function proposals(state) {
  return layout(
    /* HTML */ `<button class="back-link" data-route="dashboard">← К обзору</button>
      <h1 class="page-title">Предложения команд</h1>
      <p class="sub">Анализ оттока клиентов · 6 откликов</p>
      <div style="max-width:800px;margin-top:26px">
        <div class="card proposal-card">
          <div class="row" style="justify-content:space-between">
            <div>
              <h3>Data Wizards</h3>
              <span class="muted">Команда из 4 студентов</span>
            </div>
            ${state.selected ? badge('Команда выбрана', 'selected') : badge('Новое предложение', 'soft')}
          </div>
          <div class="team-avatars">
            <span class="avatar">АМ</span
            ><span class="avatar" style="background:#daf3f0;color:#269789">ДК</span
            ><span class="avatar" style="background:#fcebdc;color:#b57b4a">ЕС</span
            ><span class="avatar" style="background:#e9e2fb;color:#8160b9">+1</span>
          </div>
          ${tags(['Python', 'ML', 'Analytics'])}
          <h4>Идея решения</h4>
          <p>
            Исследуем поведение клиентов, выявим причины оттока и подготовим модель оценки риска с
            понятной визуализацией для бизнес-команды.
          </p>
          <h4>План</h4>
          <ol>
            <li>Анализ данных</li>
            <li>Подготовка данных</li>
            <li>ML-модель</li>
            <li>Dashboard</li>
          </ol>
          <p><strong>Срок: 2 недели</strong></p>
          <div class="actions" style="flex-wrap:wrap">
            ${btn('Открыть прототип', 'prototype', 'ghost small')}${!state.selected ? btn('Выбрать команду', 'choose', 'primary small') : ''}${!state.selected ? btn('Отклонить', 'reject', 'danger small') : ''}
          </div>
        </div>
        <div class="card proposal-card">
          <div class="row" style="justify-content:space-between">
            <h3>Insight Lab</h3>
            ${badge('На рассмотрении', 'review')}
          </div>
          <p>
            Предлагаем исследовать сегменты клиентов и собрать интерактивный аналитический отчёт.
          </p>
          ${tags(['Data', 'Research', 'Dashboard'])}
        </div>
      </div>`,
    'proposals',
    'business',
    state.auth,
  );
}
