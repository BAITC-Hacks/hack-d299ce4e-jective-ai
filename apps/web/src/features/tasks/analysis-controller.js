import { initialAnalysis, fieldLabels, withMissingInformation } from '../../services/ai/types.js';
import { taskAnalysisService } from '../../services/ai/taskAnalysis.js';
import { createScoringController } from './scoring-controller.js';

export function createAnalysisController({
  store,
  router,
  service = taskAnalysisService,
  scoring = createScoringController({ store, router, service }),
  workspace,
}) {
  const current = () => store.getState().taskAnalysis || initialAnalysis();
  const update = (patch) =>
    store.update((state) => ({ ...state, taskAnalysis: { ...current(), ...patch } }));
  const show = (patch) => {
    update(patch);
    router.render();
  };
  async function request(operation) {
    if (['analyzing', 'generating'].includes(current().step)) return;
    const scope = workspace?.scope();
    const isCurrent = () => !workspace || workspace.isCurrent(scope);
    const originalDescription =
      operation === 'analyzing' ? store.getState().description : current().originalDescription;
    show({ step: operation, originalDescription, error: '', retry: operation });
    try {
      if (workspace && !(await workspace.flush()))
        throw new Error('Сначала сохраните черновик в Supabase: повторите синхронизацию.');
      if (!isCurrent()) return;
      if (operation === 'analyzing') {
        const response = await service.analyzeTaskDescription(originalDescription);
        if (!isCurrent()) return;
        show({
          ...response,
          step: 'questions',
          answers: {},
          currentQuestion: 0,
          analysisResult: null,
        });
      } else {
        const { questions, answers } = current();
        const analysisResult = await service.generateTaskFromAnswers(
          originalDescription,
          questions,
          answers,
        );
        if (!isCurrent()) return;
        show({ step: 'result', analysisResult });
      }
      if (workspace) await workspace.flush();
    } catch (error) {
      if (!isCurrent()) return;
      show({ step: 'error', error: error.message || 'Повторите попытку.' });
    }
  }
  function onAnalysisAccepted(result) {
    const normalized = withMissingInformation(result);
    store.update((state) => ({
      ...state,
      taskAnalysis: { ...current(), analysisResult: normalized },
      acceptedAnalysis: normalized,
      fields: Object.fromEntries(
        Object.entries(fieldLabels).map(([key, label]) => [label, normalized[key] || 'Не указано']),
      ),
      rating: null,
      aiScoring: null,
    }));
    router.navigate('editor');
    void scoring.score();
  }
  return {
    setAnswer(id, value) {
      update({ answers: { ...current().answers, [id]: value } });
    },
    setResultField(key, value) {
      if (!Object.hasOwn(fieldLabels, key) || !current().analysisResult) return;
      update({
        analysisResult: withMissingInformation({
          ...current().analysisResult,
          [key]: value.trim() ? value : null,
        }),
      });
    },
    actions: {
      analyze: () => request('analyzing'),
      'analysis-retry': () => request(current().retry),
      'analysis-description': () => show({ step: 'description' }),
      'analysis-back': () => show({ currentQuestion: Math.max(0, current().currentQuestion - 1) }),
      'analysis-next': async () => {
        if (workspace && !(await workspace.flush())) return;
        return current().currentQuestion + 1 < current().questions.length
          ? show({ currentQuestion: current().currentQuestion + 1 })
          : request('generating');
      },
      'analysis-questions': () => show({ step: 'questions', currentQuestion: 0 }),
      'analysis-accept': () => {
        if (current().step === 'result') onAnalysisAccepted(current().analysisResult);
      },
    },
  };
}
