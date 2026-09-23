import { createHttpClient } from '../../shared/api/client.js';
import { fieldLabels, withMissingInformation } from './types.js';

const nonempty = (value) => typeof value === 'string' && value.trim().length > 0;
export function validateQuestions(value) {
  if (
    !value ||
    !Array.isArray(value.questions) ||
    value.questions.length < 3 ||
    value.questions.length > 100 ||
    !Array.isArray(value.knownInformation) ||
    !value.knownInformation.every(nonempty) ||
    !Array.isArray(value.missingInformation) ||
    !value.missingInformation.every(nonempty) ||
    value.questions.some(
      (q) =>
        !q ||
        !nonempty(q.id) ||
        !nonempty(q.text) ||
        !nonempty(q.reason) ||
        !Object.hasOwn(fieldLabels, q.field),
    ) ||
    new Set(value.questions.map((q) => q.id)).size !== value.questions.length
  ) {
    throw new Error('AI не вернул минимум три корректных уточняющих вопроса.');
  }
  return value;
}

export function validateResult(value) {
  if (
    !value ||
    (typeof value.title === 'string' && value.title.length > 200) ||
    Object.keys(fieldLabels).some((key) => value[key] !== null && !nonempty(value[key])) ||
    !Object.keys(fieldLabels).some((key) => nonempty(value[key])) ||
    !Array.isArray(value.missingInformation) ||
    value.missingInformation.some((key) => !Object.hasOwn(fieldLabels, key))
  ) {
    throw new Error('AI вернул пустую или некорректную карточку.');
  }
  return withMissingInformation(
    Object.fromEntries(Object.keys(fieldLabels).map((key) => [key, value[key]])),
  );
}

export function createTaskAnalysisService({
  getAccessToken,
  client = createHttpClient({
    baseUrl: import.meta.env?.VITE_API_BASE_URL || '/api',
    timeoutMs: 75000,
  }),
} = {}) {
  async function run(operation, payload, validate) {
    const token = payload.attachmentIds?.length ? await getAccessToken?.() : null;
    if (payload.attachmentIds?.length && !token)
      throw new Error('Войдите снова, чтобы использовать прикреплённые файлы.');
    const value = await client.request(`ai/task-analysis/${operation}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
    });
    return validate(value);
  }
  function validateDescription(description, hasAttachments = false) {
    if (!description?.trim()) throw new Error('Опишите задачу или проблему.');
    if (!hasAttachments && description.trim().length < 20)
      throw new Error('Добавьте подробности: минимум 20 символов.');
    if (description.length > 10000) throw new Error('Сократите описание до 10 000 символов.');
  }
  return {
    async scoreTask(card) {
      return run('score', { card }, (value) => {
        if (
          !value ||
          !Number.isInteger(value.score) ||
          value.score < 0 ||
          value.score > 100 ||
          !nonempty(value.summary) ||
          !Array.isArray(value.criteria) ||
          value.criteria.length !== 7 ||
          new Set(value.criteria.map((c) => c.id)).size !== 7 ||
          value.criteria.some(
            (c) =>
              !nonempty(c.label) ||
              !nonempty(c.explanation) ||
              !nonempty(c.recommendation) ||
              !Number.isInteger(c.score) ||
              !Number.isInteger(c.maxScore) ||
              c.maxScore <= 0 ||
              c.score < 0 ||
              c.score > c.maxScore,
          ) ||
          value.criteria.reduce((sum, c) => sum + c.maxScore, 0) !== 100 ||
          value.criteria.reduce((sum, c) => sum + c.score, 0) !== value.score
        ) {
          throw new Error('AI вернул некорректную оценку карточки.');
        }
        return value;
      });
    },
    async analyzeTaskDescription(description, attachmentIds = []) {
      validateDescription(description, attachmentIds.length > 0);
      return run(
        'questions',
        { description, ...(attachmentIds.length ? { attachmentIds } : {}) },
        validateQuestions,
      );
    },
    async generateTaskFromAnswers(description, questions, answers, attachmentIds = []) {
      validateDescription(description, attachmentIds.length > 0);
      validateQuestions({ questions, knownInformation: [], missingInformation: [] });
      return run(
        'generate',
        { description, questions, answers, ...(attachmentIds.length ? { attachmentIds } : {}) },
        validateResult,
      );
    },
  };
}

export const taskAnalysisService = createTaskAnalysisService();
