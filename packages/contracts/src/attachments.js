export const ATTACHMENT_BUCKET = 'task-attachments';
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_ATTACHMENTS = 5;
export const attachmentTypes = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  txt: 'text/plain',
  csv: 'text/csv',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};
export const attachmentAccept = Object.keys(attachmentTypes)
  .map((ext) => `.${ext}`)
  .join(',');
export const isUuid = (value) =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export function validateAttachment(name, size) {
  if (
    typeof name !== 'string' ||
    !name.trim() ||
    name.length > 200 ||
    name.includes('/') ||
    name.includes('\\') ||
    Array.from(name).some((character) => character.charCodeAt(0) < 32)
  )
    throw new Error('Некорректное имя файла (до 200 символов).');
  const extension = name.split('.').at(-1).toLowerCase();
  if (!Object.hasOwn(attachmentTypes, extension))
    throw new Error('Поддерживаются PDF, DOCX, XLSX, TXT, CSV, PNG, JPG и WebP.');
  if (!Number.isInteger(size) || size < 1 || size > MAX_ATTACHMENT_BYTES)
    throw new Error('Размер файла должен быть от 1 байта до 10 МБ.');
  return { extension, mime: attachmentTypes[extension] };
}
export function validExtraction(value) {
  return (
    value &&
    typeof value.summary === 'string' &&
    value.summary.length <= 3000 &&
    Array.isArray(value.facts) &&
    value.facts.length <= 20 &&
    value.facts.every(
      (f) =>
        typeof f?.text === 'string' &&
        f.text.length > 0 &&
        f.text.length <= 1000 &&
        typeof f.source === 'string' &&
        f.source.length <= 200,
    ) &&
    Array.isArray(value.warnings) &&
    value.warnings.length <= 10 &&
    value.warnings.every((s) => typeof s === 'string' && s.length <= 500) &&
    JSON.stringify(value).length <= 16000
  );
}
