import { createHttpClient } from '../../shared/api/client.js';

export function createAttachmentsClient({
  getAccessToken,
  client = createHttpClient({
    baseUrl: import.meta.env?.VITE_API_BASE_URL || '/api',
    timeoutMs: 90000,
  }),
}) {
  async function request(path, options = {}) {
    const token = await getAccessToken();
    if (!token) throw new Error('Войдите в аккаунт, чтобы работать с вложениями.');
    return client.request(`task-attachments${path}`, {
      ...options,
      headers: { ...options.headers, Authorization: `Bearer ${token}` },
    });
  }
  return {
    list: (draftId) => request(`?draft=${encodeURIComponent(draftId)}`),
    upload: (draftId, file) =>
      request(`?draft=${encodeURIComponent(draftId)}&name=${encodeURIComponent(file.name)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: file,
      }),
    analyze: (id) => request(`/${encodeURIComponent(id)}/analyze`, { method: 'POST' }),
    remove: (id) => request(`/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    download: (id) => request(`/${encodeURIComponent(id)}/download`),
  };
}
