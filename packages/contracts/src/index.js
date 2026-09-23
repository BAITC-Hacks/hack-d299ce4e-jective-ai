/**
 * Shared public task DTO. Keep database models and private fields in the API.
 * @typedef {object} Task
 * @property {number} id Positive integer identifier.
 * @property {string} title
 * @property {string} industry
 * @property {string} direction
 * @property {number} score Readiness between 0 and 100.
 * @property {number} reply Number of proposals.
 * @property {string} description
 * @property {string[]} tags
 */

export {
  validateProposalWrite,
  validateProposal,
  validateProposalList,
  validateProposalDecision,
} from './proposals.js';

export const API_PATHS = Object.freeze({
  health: '/api/health',
  tasks: '/api/tasks',
  myTasks: '/api/tasks/mine',
  taskWorkspace: '/api/task-workspace',
  proposals: '/api/proposals',
  authMe: '/api/auth/me',
});

const isText = (value) => typeof value === 'string' && value.trim().length > 0;

export const TASK_CARD_FIELDS = Object.freeze([
  'title',
  'context',
  'need',
  'users',
  'data',
  'constraints',
  'expectedResult',
  'successCriteria',
  'businessContact',
  'interactionFormat',
]);

function taskText(value, field, max, { nullable = false, required = false } = {}) {
  if (nullable && value == null) return null;
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) {
    throw new TypeError(
      `${field}: требуется текст${required ? ', не пустой' : ''}, до ${max} символов.`,
    );
  }
  return value.trim();
}

function validateCard(value, { publish = false } = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('card: требуется объект карточки задачи.');
  }
  if (Object.keys(value).some((key) => !TASK_CARD_FIELDS.includes(key))) {
    throw new TypeError('card: неизвестное поле карточки.');
  }
  return Object.fromEntries(
    TASK_CARD_FIELDS.map((field) => [
      field,
      taskText(value[field], `card.${field}`, field === 'title' ? 200 : 10_000, {
        nullable: field !== 'title' && !(publish && ['need', 'expectedResult'].includes(field)),
        required: field === 'title' || (publish && ['need', 'expectedResult'].includes(field)),
      }),
    ]),
  );
}

/** Strict task write contract. Ownership and database IDs are never client-controlled. */
export function validateTaskWrite(value) {
  const fields = [
    'requestId',
    'status',
    'description',
    'card',
    'industry',
    'direction',
    'tags',
    'score',
  ];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Требуется объект задачи.');
  }
  if (Object.keys(value).some((key) => !fields.includes(key))) {
    throw new TypeError('Неизвестное поле задачи.');
  }
  if (!isUuid(value.requestId)) throw new TypeError('requestId: требуется UUID.');
  if (!['draft', 'published'].includes(value.status))
    throw new TypeError('Некорректный статус задачи.');
  const description = taskText(value.description, 'description', 10_000);
  if (value.status === 'published' && description.length < 20) {
    throw new TypeError('Описание публикуемой задачи должно содержать минимум 20 символов.');
  }
  const card = validateCard(value.card, { publish: value.status === 'published' });
  const industry = taskText(value.industry ?? '', 'industry', 100);
  const direction = taskText(value.direction ?? '', 'direction', 100);
  const tags = value.tags ?? [];
  if (
    !Array.isArray(tags) ||
    tags.length > 10 ||
    tags.some((tag) => !isText(tag) || tag.length > 50)
  ) {
    throw new TypeError('tags: максимум 10 непустых строк до 50 символов.');
  }
  const score = value.score ?? null;
  if (score !== null && (!Number.isInteger(score) || score < 0 || score > 100)) {
    throw new TypeError('score: требуется целое число от 0 до 100 или null.');
  }
  return {
    requestId: value.requestId,
    status: value.status,
    description,
    card,
    industry,
    direction,
    tags: [...new Set(tags.map((tag) => tag.trim()))],
    score,
  };
}

function strictObject(value, fields, label) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !fields.includes(key))
  ) {
    throw new TypeError(`${label}: некорректный объект или неизвестное поле.`);
  }
}

function workspaceCard(value, analysis = false) {
  if (value === null) return null;
  strictObject(
    value,
    analysis ? [...TASK_CARD_FIELDS, 'missingInformation'] : TASK_CARD_FIELDS,
    'card',
  );
  const result = Object.fromEntries(
    TASK_CARD_FIELDS.map((field) => [
      field,
      taskText(value[field], `card.${field}`, field === 'title' ? 200 : 10_000, { nullable: true }),
    ]),
  );
  if (analysis) result.missingInformation = fieldList(value.missingInformation);
  return result;
}

function fieldList(value) {
  if (
    !Array.isArray(value) ||
    value.length > TASK_CARD_FIELDS.length ||
    value.some((field) => !TASK_CARD_FIELDS.includes(field))
  )
    throw new TypeError('Некорректный список полей.');
  return [...new Set(value)];
}

function textList(value, label) {
  if (!Array.isArray(value) || value.length > 100)
    throw new TypeError(`${label}: некорректный список.`);
  return value.map((text) => taskText(text, label, 10_000));
}

function workspaceScoring(value) {
  if (value == null) return null;
  strictObject(value, ['score', 'summary', 'criteria'], 'scoringResult');
  const bounds = {
    problem: 20,
    users: 10,
    data: 15,
    result: 15,
    success: 20,
    constraints: 10,
    collaboration: 10,
  };
  if (!Array.isArray(value.criteria) || value.criteria.length !== 7)
    throw new TypeError('Некорректные критерии оценки.');
  const seen = new Set();
  const criteria = value.criteria.map((item) => {
    strictObject(
      item,
      ['id', 'label', 'maxScore', 'score', 'explanation', 'recommendation'],
      'criterion',
    );
    if (
      !Object.hasOwn(bounds, item.id) ||
      seen.has(item.id) ||
      item.maxScore !== bounds[item.id] ||
      !Number.isInteger(item.score) ||
      item.score < 0 ||
      item.score > item.maxScore
    )
      throw new TypeError('Некорректная оценка критерия.');
    seen.add(item.id);
    return {
      id: item.id,
      maxScore: item.maxScore,
      score: item.score,
      label: taskText(item.label, 'label', 200, { required: true }),
      explanation: taskText(item.explanation, 'explanation', 10_000, { required: true }),
      recommendation: taskText(item.recommendation, 'recommendation', 10_000, { required: true }),
    };
  });
  const score = criteria.reduce((sum, item) => sum + item.score, 0);
  if (value.score !== score) throw new TypeError('Некорректная сумма оценки.');
  return {
    score,
    summary: taskText(value.summary, 'summary', 10_000, { required: true }),
    criteria,
  };
}

/** A private, explicit autosave DTO; credentials, profile and arbitrary application state are rejected. */
export function validateTaskWorkspace(value) {
  strictObject(
    value,
    [
      'version',
      'description',
      'analysis',
      'card',
      'metadata',
      'requestId',
      'taskId',
      'score',
      'scoringResult',
      'attachments',
    ],
    'workspace',
  );
  if (value.version !== 1) throw new TypeError('Неизвестная версия черновика.');
  const flow = value.analysis;
  strictObject(
    flow,
    [
      'step',
      'originalDescription',
      'questions',
      'answers',
      'currentQuestion',
      'analysisResult',
      'knownInformation',
      'missingInformation',
      'attachmentSources',
    ],
    'analysis',
  );
  if (!['description', 'questions', 'result'].includes(flow.step))
    throw new TypeError('Некорректный этап анализа.');
  if (!Array.isArray(flow.questions) || flow.questions.length > 100)
    throw new TypeError('Некорректный список вопросов.');
  const seen = new Set();
  const questions = flow.questions.map((question) => {
    strictObject(question, ['id', 'field', 'text', 'reason'], 'question');
    const id = taskText(question.id, 'question.id', 100, { required: true });
    if (
      ['__proto__', 'constructor', 'prototype'].includes(id) ||
      seen.has(id) ||
      !TASK_CARD_FIELDS.includes(question.field)
    )
      throw new TypeError('Некорректный идентификатор вопроса.');
    seen.add(id);
    return {
      id,
      field: question.field,
      text: taskText(question.text, 'question.text', 10_000, { required: true }),
      reason: taskText(question.reason, 'question.reason', 10_000),
    };
  });
  strictObject(flow.answers, [...seen], 'answers');
  const answers = Object.fromEntries(
    Object.entries(flow.answers).map(([id, answer]) => [id, taskText(answer, 'answer', 10_000)]),
  );
  if (
    !Number.isInteger(flow.currentQuestion) ||
    flow.currentQuestion < 0 ||
    flow.currentQuestion > questions.length
  )
    throw new TypeError('Некорректный текущий вопрос.');
  strictObject(value.metadata, ['industry', 'direction', 'tags'], 'metadata');
  const tags = value.metadata.tags;
  if (
    !Array.isArray(tags) ||
    tags.length > 10 ||
    tags.some((tag) => !isText(tag) || tag.length > 50)
  )
    throw new TypeError('Некорректные теги.');
  if (value.requestId !== null && !isUuid(value.requestId))
    throw new TypeError('Некорректный requestId.');
  if (value.taskId !== null && (!Number.isSafeInteger(value.taskId) || value.taskId < 1))
    throw new TypeError('Некорректный taskId.');
  if (
    value.score !== null &&
    (!Number.isInteger(value.score) || value.score < 0 || value.score > 100)
  )
    throw new TypeError('Некорректная оценка.');
  let attachments;
  if (value.attachments !== undefined) {
    strictObject(value.attachments, ['draftId', 'selectedIds'], 'attachments');
    const { draftId, selectedIds } = value.attachments;
    if (
      (draftId !== null && !isUuid(draftId)) ||
      !Array.isArray(selectedIds) ||
      selectedIds.length > 5 ||
      selectedIds.some((id) => !isUuid(id)) ||
      new Set(selectedIds).size !== selectedIds.length
    )
      throw new TypeError('Некорректные вложения черновика.');
    attachments = { draftId, selectedIds: [...selectedIds] };
  }
  let attachmentSources;
  if (flow.attachmentSources !== undefined) {
    if (!Array.isArray(flow.attachmentSources) || flow.attachmentSources.length > 5)
      throw new TypeError('Некорректные источники анализа.');
    const sourceIds = new Set();
    attachmentSources = flow.attachmentSources.map((source) => {
      strictObject(source, ['id', 'name'], 'attachmentSource');
      if (!isUuid(source.id) || sourceIds.has(source.id))
        throw new TypeError('Некорректный идентификатор источника анализа.');
      sourceIds.add(source.id);
      return {
        id: source.id,
        name: taskText(source.name, 'attachmentSource.name', 200, { required: true }),
      };
    });
  }
  return {
    version: 1,
    description: taskText(value.description, 'description', 10_000),
    analysis: {
      step: flow.step,
      originalDescription: taskText(flow.originalDescription, 'originalDescription', 10_000),
      questions,
      answers,
      currentQuestion: flow.currentQuestion,
      analysisResult: workspaceCard(flow.analysisResult, true),
      knownInformation: textList(flow.knownInformation, 'knownInformation'),
      missingInformation: fieldList(flow.missingInformation),
      ...(attachmentSources === undefined ? {} : { attachmentSources }),
    },
    card: workspaceCard(value.card),
    metadata: {
      industry: taskText(value.metadata.industry, 'industry', 100),
      direction: taskText(value.metadata.direction, 'direction', 100),
      tags: [...new Set(tags.map((tag) => tag.trim()))],
    },
    requestId: value.requestId,
    taskId: value.taskId,
    score: value.score,
    scoringResult: workspaceScoring(value.scoringResult),
    ...(attachments === undefined ? {} : { attachments }),
  };
}

/** Validate and copy an untrusted task, omitting non-public fields.
 * @param {unknown} value
 * @returns {Task}
 */
export function validateTask(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Task must be an object.');
  }

  if (!Number.isSafeInteger(value.id) || value.id < 1) {
    throw new TypeError('Task.id must be a positive safe integer.');
  }
  for (const field of ['title']) {
    if (!isText(value[field])) {
      throw new TypeError(`Task.${field} must be a non-empty string.`);
    }
  }
  for (const field of ['industry', 'direction', 'description']) {
    if (typeof value[field] !== 'string') throw new TypeError(`Task.${field} must be a string.`);
  }
  if (
    value.score !== null &&
    (!Number.isFinite(value.score) || value.score < 0 || value.score > 100)
  ) {
    throw new TypeError('Task.score must be a number between 0 and 100.');
  }
  if (!Number.isSafeInteger(value.reply) || value.reply < 0) {
    throw new TypeError('Task.reply must be a non-negative safe integer.');
  }
  if (!Array.isArray(value.tags) || !value.tags.every(isText)) {
    throw new TypeError('Task.tags must be an array of non-empty strings.');
  }

  const task = {
    id: value.id,
    title: value.title,
    industry: value.industry,
    direction: value.direction,
    score: value.score,
    reply: value.reply,
    description: value.description,
    tags: [...value.tags],
  };
  if (value.card !== undefined) task.card = validateCard(value.card);
  if (value.status !== undefined) {
    if (!['draft', 'published'].includes(value.status)) throw new TypeError('Invalid task status.');
    task.status = value.status;
  }
  for (const field of ['createdAt', 'updatedAt', 'publishedAt']) {
    if (value[field] !== undefined) {
      if (field === 'publishedAt' && value[field] === null) task[field] = null;
      else if (typeof value[field] === 'string' && Number.isFinite(Date.parse(value[field])))
        task[field] = value[field];
      else throw new TypeError(`Task.${field} must be a timestamp.`);
    }
  }
  if (value.requestId !== undefined) {
    if (!isUuid(value.requestId)) throw new TypeError('Task.requestId must be a UUID.');
    task.requestId = value.requestId;
  }
  if (value.originalDescription !== undefined)
    task.originalDescription = taskText(value.originalDescription, 'originalDescription', 10_000);
  if (value.analysisSnapshot != null)
    task.analysisSnapshot = validateTaskWorkspace(value.analysisSnapshot);
  return task;
}

/** @param {unknown} value @returns {Task[]} */
export function validateTaskList(value) {
  if (!Array.isArray(value)) {
    throw new TypeError('Task list must be an array.');
  }
  return value.map(validateTask);
}

const isUuid = (value) =>
  typeof value === 'string' &&
  /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);

/** Public profile DTO from the registration schema; credentials never belong here. */
export function validateProfile(value) {
  if (!value || !isUuid(value.id)) throw new TypeError('Profile.id must be a UUID.');
  if (!isText(value.full_name) || value.full_name.trim().length > 120) {
    throw new TypeError('Profile.full_name must contain between 1 and 120 characters.');
  }
  if (!['business', 'student'].includes(value.role)) throw new TypeError('Invalid profile role.');
  for (const field of ['created_at', 'updated_at']) {
    if (typeof value[field] !== 'string' || !Number.isFinite(Date.parse(value[field]))) {
      throw new TypeError(`Profile.${field} must be a timestamp.`);
    }
  }
  return {
    id: value.id,
    full_name: value.full_name.trim(),
    role: value.role,
    created_at: value.created_at,
    updated_at: value.updated_at,
  };
}

export function validateAuthUserResponse(value) {
  if (!value || !value.user || !isUuid(value.user.id) || !isText(value.user.email)) {
    throw new TypeError('Invalid authenticated user.');
  }
  const profile = validateProfile(value.profile);
  if (profile.id !== value.user.id) throw new TypeError('User and profile IDs must match.');
  return { user: { id: value.user.id, email: value.user.email }, profile };
}
