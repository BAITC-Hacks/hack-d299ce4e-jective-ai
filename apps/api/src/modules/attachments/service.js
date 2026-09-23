import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import {
  ATTACHMENT_BUCKET,
  MAX_ATTACHMENTS,
  isUuid,
  validateAttachment,
  validExtraction,
} from '@ai-sana/contracts/attachments';
import { HttpError } from '../../shared/http-error.js';
import { createDocumentExtractor, verifyFileBytes } from './extraction.js';

const columns = 'id,draft_id,name,mime_type,size_bytes,storage_path,extracted_context,created_at';
function storageError() {
  return new HttpError(
    503,
    'ATTACHMENTS_UNAVAILABLE',
    'Сохранение вложений временно недоступно. Попробуйте позже.',
  );
}
const unwrap = (result) => {
  if (result.error) throw storageError();
  return result.data;
};
export function createAttachmentsService({
  config = null,
  clientFactory = createClient,
  extract = createDocumentExtractor(),
} = {}) {
  function clientFor(request) {
    if (!config) throw storageError();
    return clientFactory(config.url, config.publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: request.headers.authorization } },
    });
  }
  function owned(client, userId) {
    return client.from('task_attachments').select(columns).eq('owner_id', userId);
  }
  async function row(client, userId, id) {
    if (!isUuid(id))
      throw new HttpError(400, 'INVALID_ATTACHMENT_ID', 'Некорректный идентификатор файла.');
    const file = unwrap(await owned(client, userId).eq('id', id).maybeSingle());
    if (!file) throw new HttpError(404, 'ATTACHMENT_NOT_FOUND', 'Файл не найден или недоступен.');
    return file;
  }
  return {
    async list(request, userId, draftId) {
      if (!isUuid(draftId)) throw new HttpError(400, 'INVALID_DRAFT', 'Некорректный черновик.');
      return unwrap(
        await owned(clientFor(request), userId).eq('draft_id', draftId).order('created_at'),
      );
    },
    async upload(request, userId, draftId, name, bytes) {
      if (!isUuid(draftId)) throw new HttpError(400, 'INVALID_DRAFT', 'Некорректный черновик.');
      let type;
      try {
        type = validateAttachment(name, bytes.length);
      } catch (error) {
        throw new HttpError(400, 'INVALID_FILE', error.message);
      }
      verifyFileBytes(bytes, type.extension);
      const client = clientFor(request);
      const existing = unwrap(await owned(client, userId).eq('draft_id', draftId));
      if (existing.length >= MAX_ATTACHMENTS)
        throw new HttpError(400, 'TOO_MANY_FILES', 'Можно прикрепить не более пяти файлов.');
      const id = randomUUID();
      const storage_path = `${userId}/${draftId}/${id}.${type.extension}`;
      const file = unwrap(
        await client
          .from('task_attachments')
          .insert({
            id,
            owner_id: userId,
            draft_id: draftId,
            name,
            mime_type: type.mime,
            size_bytes: bytes.length,
            storage_path,
          })
          .select(columns)
          .single(),
      );
      let upload;
      try {
        upload = await client.storage
          .from(ATTACHMENT_BUCKET)
          .upload(storage_path, bytes, { contentType: type.mime, upsert: false });
      } catch {
        upload = { error: true };
      }
      if (upload.error) {
        await client.from('task_attachments').delete().eq('id', id).eq('owner_id', userId);
        throw storageError();
      }
      return file;
    },
    async analyze(request, userId, id, signal) {
      const client = clientFor(request);
      const file = await row(client, userId, id);
      const blob = unwrap(await client.storage.from(ATTACHMENT_BUCKET).download(file.storage_path));
      const context = await extract(
        { name: file.name },
        Buffer.from(await blob.arrayBuffer()),
        signal,
      );
      return unwrap(
        await client
          .from('task_attachments')
          .update({ extracted_context: context })
          .eq('id', id)
          .eq('owner_id', userId)
          .select(columns)
          .single(),
      );
    },
    async remove(request, userId, id) {
      const client = clientFor(request);
      const file = await row(client, userId, id);
      unwrap(await client.storage.from(ATTACHMENT_BUCKET).remove([file.storage_path]));
      unwrap(await client.from('task_attachments').delete().eq('id', id).eq('owner_id', userId));
      return { id };
    },
    async download(request, userId, id) {
      const client = clientFor(request);
      const file = await row(client, userId, id);
      const data = unwrap(
        await client.storage
          .from(ATTACHMENT_BUCKET)
          .createSignedUrl(file.storage_path, 60, { download: file.name }),
      );
      return { url: data.signedUrl, name: file.name };
    },
    async contexts(request, userId, ids) {
      if (
        !Array.isArray(ids) ||
        ids.length > MAX_ATTACHMENTS ||
        ids.some((id) => !isUuid(id)) ||
        new Set(ids).size !== ids.length
      )
        throw new HttpError(400, 'INVALID_ATTACHMENTS', 'Некорректный список вложений.');
      const client = clientFor(request);
      return Promise.all(
        ids.map(async (id) => {
          const file = await row(client, userId, id);
          if (!validExtraction(file.extracted_context))
            throw new HttpError(
              409,
              'ATTACHMENT_NOT_READY',
              `Сначала обработайте файл «${file.name}» или исключите его из анализа.`,
            );
          return { id, name: file.name, ...file.extracted_context };
        }),
      );
    },
  };
}
