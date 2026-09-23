import { fieldLabels } from '../../services/ai/types.js';
import { taskAnalysisService } from '../../services/ai/taskAnalysis.js';

export function createScoringController({
  store,
  router,
  service = taskAnalysisService,
  workspace,
}) {
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
      const scope = workspace?.scope();
      const current = () => !workspace || workspace.isCurrent(scope);
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
        if (workspace && !(await workspace.flush()))
          throw new Error(
            'Не удалось сохранить карточку перед AI-оценкой. Повторите синхронизацию.',
          );
        if (!current()) return;
        const result = await service.scoreTask(snapshot);
        if (!current() || requestVersion !== version || JSON.stringify(card()) !== serialized)
          return;
        store.update((state) => ({
          ...state,
          rating: result.score,
          aiScoring: { status: 'ready', result, error: '' },
        }));
      } catch (error) {
        if (!current() || requestVersion !== version || JSON.stringify(card()) !== serialized)
          return;
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
