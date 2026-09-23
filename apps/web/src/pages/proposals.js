import { layout } from '../components/layout.js';
import { proposalCards } from '../components/proposal-list.js';
export function proposals(state) {
  return layout(
    `<button class="back-link" data-route="dashboard">← К обзору</button><h1 class="page-title">Отклики на ваши задачи</h1><p class="sub">Изучите предложение и профиль студента перед выбором.</p>${proposalCards(state, true)}`,
    'proposals',
    'business',
    state.auth,
  );
}
