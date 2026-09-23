import { fieldLabels } from '../services/ai/types.js';
import { emptyProposalForm } from '../features/proposals/form.js';

/** Empty per-user workspace. Persisted tasks are loaded from the API. */
export function createInitialState() {
  return {
    ...{
      role: 'business',
      rating: null,
      published: false,
      saved: false,
      filters: { search: '', industry: '', direction: '', level: '', sort: 'rating' },
      description: '',
      answers: {},
      fields: Object.fromEntries(Object.values(fieldLabels).map((label) => [label, ''])),
    },
    currentTaskId: null,
    savedTaskIds: [],
    proposals: { items: [], status: 'idle', error: '' },
    proposalForm: emptyProposalForm(),
    proposalDecision: { id: null, status: 'idle', error: '' },
    catalog: { items: [], status: 'idle', error: '' },
    ownTasks: { items: [], status: 'idle', error: '' },
    taskSave: { status: 'idle', error: '', task: null, requestId: null },
    taskMetadata: { industry: '', direction: '', tags: [] },
    workspace: { status: 'idle', error: '', loaded: false },
    auth: {
      configured: false,
      status: 'initializing',
      user: null,
      profile: null,
      error: '',
      notice: '',
      busy: false,
    },
  };
}
