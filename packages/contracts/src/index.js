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

export const API_PATHS = Object.freeze({
  health: '/api/health',
  tasks: '/api/tasks',
});

const isText = (value) => typeof value === 'string' && value.trim().length > 0;

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
  for (const field of ['title', 'industry', 'direction', 'description']) {
    if (!isText(value[field])) {
      throw new TypeError(`Task.${field} must be a non-empty string.`);
    }
  }
  if (!Number.isFinite(value.score) || value.score < 0 || value.score > 100) {
    throw new TypeError('Task.score must be a number between 0 and 100.');
  }
  if (!Number.isSafeInteger(value.reply) || value.reply < 0) {
    throw new TypeError('Task.reply must be a non-negative safe integer.');
  }
  if (!Array.isArray(value.tags) || !value.tags.every(isText)) {
    throw new TypeError('Task.tags must be an array of non-empty strings.');
  }

  return {
    id: value.id,
    title: value.title,
    industry: value.industry,
    direction: value.direction,
    score: value.score,
    reply: value.reply,
    description: value.description,
    tags: [...value.tags],
  };
}

/** @param {unknown} value @returns {Task[]} */
export function validateTaskList(value) {
  if (!Array.isArray(value)) {
    throw new TypeError('Task list must be an array.');
  }
  return value.map(validateTask);
}
