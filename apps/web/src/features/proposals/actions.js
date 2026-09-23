import { canProposeSolution } from './permissions.js';
import { proposalFormMarkup } from './form.js';

export function createProposalActions({ store, feedback, proposals }) {
  function requireStudent() {
    if (canProposeSolution(store.getState().auth)) return true;
    feedback.toast('Предлагать решения могут только пользователи, вошедшие как студент.');
    return false;
  }
  return {
    offer() {
      if (!requireStudent() || !proposals.open(store.getState().currentTaskId)) return;
      feedback.modal(proposalFormMarkup(store.getState().proposalForm));
    },
    'offer-success'(values) {
      if (!requireStudent()) return;
      return proposals.submit(values);
    },
    'retry-proposals': () => proposals.load({ force: true }),
    'refresh-proposals': () => proposals.load({ force: true }),
    'accept-proposal': (id) => proposals.decide(id, 'accepted'),
    'reject-proposal': (id) => proposals.decide(id, 'rejected'),
  };
}
