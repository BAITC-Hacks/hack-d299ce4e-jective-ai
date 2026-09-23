import { layout } from '../components/layout.js';
import { btn } from '../components/ui.js';
import { proposalList } from '../components/proposal-card.js';
export function proposals(state) {
  return layout(
    `<button class="back-link" data-route="dashboard">← К обзору</button><div class="row" style="justify-content:space-between;flex-wrap:wrap"><h1 class="page-title">Отклики на ваши задачи</h1>${btn('Обновить', 'refresh-proposals', 'ghost small', state.proposals?.status === 'loading' || state.proposalDecision?.status === 'saving' ? 'disabled' : '')}</div><p class="sub">Изучите предложение и профиль студента перед выбором.</p>${proposalList(state, { business: true })}`,
    'proposals',
    'business',
    state.auth,
  );
}
