import { initialAnalysis, fieldLabels, withMissingInformation } from '../../services/ai/types.js';
import { taskAnalysisService } from '../../services/ai/taskAnalysis.js';
import { createScoringController } from './scoring-controller.js';
import { attachmentsBusy } from '../attachments/controller.js';

export function createAnalysisController({
  store,
  router,
  service = taskAnalysisService,
  scoring = createScoringController({ store, router, service }),
}) {
  const current = () => store.getState().taskAnalysis || initialAnalysis();
  const update = (patch) =>
    store.update((state) => ({ ...state, taskAnalysis: { ...current(), ...patch } }));
  const show = (patch) => {
    update(patch);
    router.render();
  };
  let requestVersion = 0;
  async function request(operation) {
    if (['analyzing', 'generating'].includes(current().step)) return;
    if (attachmentsBusy(store.getState())) return;
    const version = ++requestVersion;
    const owner = store.getState().auth?.user?.id;
    const stillCurrent = () =>
      version === requestVersion && owner === store.getState().auth?.user?.id;
    const sources =
      operation === 'analyzing'
        ? (store.getState().attachments?.items || [])
            .filter((i) => i.selected && i.status === 'ready')
            .map((i) => ({ id: i.id, name: i.name }))
        : current().attachmentSources || [];
    const originalDescription =
      operation === 'analyzing'
        ? store.getState().description?.trim() ||
          (sources.length ? 'Помогите сформулировать бизнес-задачу по приложенным материалам.' : '')
        : current().originalDescription;
    show({
      step: operation,
      originalDescription,
      attachmentSources: sources,
      error: '',
      retry: operation,
    });
    try {
      if (operation === 'analyzing') {
        const response = await service.analyzeTaskDescription(
          originalDescription,
          sources.map((s) => s.id),
        );
        if (!stillCurrent()) return;
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
          sources.map((s) => s.id),
        );
        if (!stillCurrent()) return;
        show({ step: 'result', analysisResult });
      }
    } catch (error) {
      if (!stillCurrent()) return;
      show({ step: 'error', error: error.message || 'Повторите попытку.' });
    }
  }
  function onAnalysisAccepted(result) {
    const normalized = withMissingInformation(result);
    store.update((state) => ({
      ...state,
      taskAnalysis: { ...current(), analysisResult: normalized },
      acceptedAnalysis: normalized,
      acceptedAttachmentIds: (current().attachmentSources || []).map((s) => s.id),
      attachmentDraftId: store.getState().attachments?.draftId || null,
      fields: Object.fromEntries(
        Object.entries(fieldLabels).map(([key, label]) => [label, normalized[key] || 'Не указано']),
      ),
      rating: null,
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
      'analysis-next': () =>
        current().currentQuestion + 1 < current().questions.length
          ? show({ currentQuestion: current().currentQuestion + 1 })
          : request('generating'),
      'analysis-questions': () => show({ step: 'questions', currentQuestion: 0 }),
      'analysis-accept': () => {
        if (current().step === 'result') onAnalysisAccepted(current().analysisResult);
      },
    },
  };
}
