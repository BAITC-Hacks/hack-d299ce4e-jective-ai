import { btn } from '../components/ui.js';
import { layout } from '../components/layout.js';
import { proposalList } from '../components/proposal-card.js';

export function proposals(state) {
  return layout(
    /* HTML */ `<button class="back-link" data-route="dashboard">← К обзору</button>
      <div class="row" style="justify-content:space-between;flex-wrap:wrap">
        <h1 class="page-title">Предложения команд</h1>
        ${btn('Обновить', 'refresh-proposals', 'ghost small', state.proposals?.status === 'loading' ? 'disabled' : '')}
      </div>
      <p class="sub">Отклики студентов на ваши задачи. Данные загружаются из Supabase.</p>
      <div style="max-width:800px;margin-top:26px">
        ${proposalList(state, { business: true })}
      </div>`,
    'proposals',
    'business',
    state.auth,
  );
}
