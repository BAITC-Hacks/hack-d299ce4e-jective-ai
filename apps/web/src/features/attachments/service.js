import { createHttpClient } from '../../shared/api/client.js';

export function createAttachmentsClient({
  getAccessToken,
  client = createHttpClient({
    baseUrl: import.meta.env?.VITE_API_BASE_URL || '/api',
    timeoutMs: 90000,
  }),
}) {
  async function request(path, options = {}, { userId } = {}) {
    const token = await getAccessToken(userId);
    if (!token) throw new Error('Войдите в аккаунт, чтобы работать с вложениями.');
    return client.request(`task-attachments${path}`, {
      ...options,
      headers: { ...options.headers, Authorization: `Bearer ${token}` },
    });
  }
  return {
    list: (draftId, scope) => request(`?draft=${encodeURIComponent(draftId)}`, {}, scope),
    upload: (draftId, file, scope) =>
      request(
        `?draft=${encodeURIComponent(draftId)}&name=${encodeURIComponent(file.name)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: file,
        },
        scope,
      ),
    analyze: (id, scope) =>
      request(`/${encodeURIComponent(id)}/analyze`, { method: 'POST' }, scope),
    remove: (id, scope) => request(`/${encodeURIComponent(id)}`, { method: 'DELETE' }, scope),
    download: (id, scope) => request(`/${encodeURIComponent(id)}/download`, {}, scope),
  };
}
