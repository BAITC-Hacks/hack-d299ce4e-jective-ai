const writeFields = ['taskId', 'teamName', 'idea', 'plan', 'deadline', 'prototypeUrl'];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const statuses = ['pending', 'accepted', 'rejected'];

function isTimestamp(value) {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

function object(value, fields) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !fields.includes(key))
  ) {
    throw new TypeError('Некорректный объект отклика или неизвестное поле.');
  }
}

function text(value, field, max) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  // PostgreSQL char_length counts Unicode code points, not UTF-16 code units.
  if (!normalized || [...normalized].length > max) {
    throw new TypeError(`${field}: требуется непустой текст до ${max} символов.`);
  }
  if (
    [...normalized].some((character) => {
      const point = character.codePointAt(0);
      return point === 0 || (point >= 0xd800 && point <= 0xdfff);
    })
  )
    throw new TypeError(`${field}: некорректный символ Unicode.`);
  return normalized;
}

function prototypeUrl(value) {
  if (value == null || value === '') return null;
  const source = text(value, 'Ссылка на прототип', 2048);
  let url;
  try {
    url = new globalThis.URL(source);
  } catch {
    throw new TypeError('Ссылка на прототип должна быть корректным HTTP(S)-адресом.');
  }
  if (
    !/^https?:\/\//i.test(source) ||
    /\s|\\/.test(source) ||
    [...source].some(
      (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    ) ||
    !['http:', 'https:'].includes(url.protocol) ||
    !url.hostname ||
    url.username ||
    url.password ||
    url.href.length > 2048
  ) {
    throw new TypeError('Ссылка на прототип должна быть HTTP(S)-адресом без логина и пароля.');
  }
  return url.href;
}

/** Student identity, IDs and timestamps must come from the server, never the form. */
export function validateProposalWrite(value) {
  object(value, writeFields);
  if (!Number.isSafeInteger(value.taskId) || value.taskId < 1) {
    throw new TypeError('taskId: требуется положительное целое число.');
  }
  return {
    taskId: value.taskId,
    teamName: text(value.teamName, 'Название команды', 200),
    idea: text(value.idea, 'Идея решения', 10_000),
    plan: text(value.plan, 'План реализации', 10_000),
    deadline: text(value.deadline, 'Сроки', 200),
    prototypeUrl: prototypeUrl(value.prototypeUrl),
  };
}

/** Private response DTO: available only to the submitting student and task owner. */
export function validateProposal(value) {
  object(value, [
    ...writeFields,
    'id',
    'taskTitle',
    'createdAt',
    'status',
    'decidedAt',
    'counterpartId',
  ]);
  if (typeof value.id !== 'string' || !uuid.test(value.id)) {
    throw new TypeError('Некорректный идентификатор отклика.');
  }
  if (!isTimestamp(value.createdAt)) {
    throw new TypeError('Некорректная дата отклика.');
  }
  if (
    value.counterpartId !== undefined &&
    (typeof value.counterpartId !== 'string' || !uuid.test(value.counterpartId))
  ) {
    throw new TypeError('Некорректный идентификатор участника отклика.');
  }
  if (
    !statuses.includes(value.status) ||
    (value.status === 'pending' ? value.decidedAt !== null : !isTimestamp(value.decidedAt))
  ) {
    throw new TypeError('Некорректный статус или дата решения по отклику.');
  }
  return {
    id: value.id,
    ...validateProposalWrite(Object.fromEntries(writeFields.map((key) => [key, value[key]]))),
    taskTitle: text(value.taskTitle, 'Название задачи', 200),
    createdAt: value.createdAt,
    status: value.status,
    decidedAt: value.decidedAt,
    ...(value.counterpartId === undefined ? {} : { counterpartId: value.counterpartId }),
  };
}

/** Only the task owner can make a decision; dates and proposal content are immutable inputs. */
export function validateProposalDecision(value) {
  object(value, ['status', 'expectedStatus']);
  if (
    !['accepted', 'rejected'].includes(value.status) ||
    !statuses.includes(value.expectedStatus)
  ) {
    throw new TypeError('Требуется решение «accepted» или «rejected» и текущий статус отклика.');
  }
  return { status: value.status, expectedStatus: value.expectedStatus };
}

export function validateProposalList(value) {
  if (!Array.isArray(value)) throw new TypeError('Ожидается список откликов.');
  return value.map(validateProposal);
}
