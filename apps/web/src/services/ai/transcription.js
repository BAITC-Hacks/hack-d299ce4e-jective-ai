import { createHttpClient } from '../../shared/api/client.js';

export function createTranscriptionClient({
  client = createHttpClient({
    baseUrl: import.meta.env?.VITE_API_BASE_URL || '/api',
    timeoutMs: 75000,
  }),
} = {}) {
  return {
    async transcribe(blob, signal) {
      const result = await client.request('ai/task-analysis/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': blob.type },
        body: blob,
        signal,
      });
      if (typeof result?.text !== 'string' || !result.text.trim())
        throw new Error('Речь не распознана. Попробуйте ещё раз.');
      return result.text.trim();
    },
  };
}
