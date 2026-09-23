/** @typedef {'description'|'analyzing'|'questions'|'generating'|'result'|'error'} CreateTaskStep */
/** @typedef {{id: string, field: string, text: string, reason: string}} TaskQuestion */
/** @typedef {{title: ?string, context: ?string, need: ?string, users: ?string, data: ?string, constraints: ?string, expectedResult: ?string, successCriteria: ?string, businessContact: ?string, interactionFormat: ?string, missingInformation: string[]}} TaskAnalysis */

export const fieldLabels = {
  title: 'Название',
  context: 'Контекст',
  need: 'Бизнес-потребность',
  users: 'Пользователи',
  data: 'Доступные данные',
  constraints: 'Ограничения',
  expectedResult: 'Ожидаемый результат',
  successCriteria: 'Критерии успеха',
  businessContact: 'Контакт бизнеса',
  interactionFormat: 'Формат взаимодействия',
};

export const initialAnalysis = () => ({
  step: 'description',
  originalDescription: '',
  questions: [],
  answers: {},
  currentQuestion: 0,
  analysisResult: null,
  knownInformation: [],
  missingInformation: [],
  error: '',
  retry: 'analyzing',
});

export function withMissingInformation(result) {
  return {
    ...result,
    missingInformation: Object.keys(fieldLabels).filter((key) => !result[key]?.trim()),
  };
}
