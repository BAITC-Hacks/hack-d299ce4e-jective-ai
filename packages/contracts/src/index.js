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
  authMe: '/api/auth/me',
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
