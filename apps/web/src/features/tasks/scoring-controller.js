import { fieldLabels } from '../../services/ai/types.js';
import { taskAnalysisService } from '../../services/ai/taskAnalysis.js';

export function createScoringController({ store, router, service = taskAnalysisService }) {
  let version = 0;
  const card = () =>
    Object.fromEntries(
      Object.entries(fieldLabels).map(([key, label]) => {
        const value = store.getState().fields[label]?.trim();
        return [key, !value || value === 'Не указано' ? null : value];
      }),
    );
  return {
    async score() {
      const snapshot = card();
      const serialized = JSON.stringify(snapshot);
      const requestVersion = ++version;
      store.update((state) => ({
        ...state,
        rating: null,
        aiScoring: { status: 'loading', result: null, error: '' },
      }));
      router.render();
      try {
        const result = await service.scoreTask(snapshot);
        if (requestVersion !== version || JSON.stringify(card()) !== serialized) return;
        store.update((state) => ({
          ...state,
          rating: result.score,
          aiScoring: { status: 'ready', result, error: '' },
        }));
      } catch (error) {
        if (requestVersion !== version || JSON.stringify(card()) !== serialized) return;
        store.update((state) => ({
          ...state,
          rating: null,
          aiScoring: {
            status: 'error',
            result: null,
            error: error.message || 'Не удалось оценить карточку.',
          },
        }));
      }
      router.render();
    },
  };
}
