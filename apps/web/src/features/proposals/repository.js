import {
  validateProposal,
  validateProposalList,
  validateProposalWrite,
  validateProposalDecision,
} from '@ai-sana/contracts';
import { ApiError, createHttpClient } from '../../shared/api/client.js';

export function createProposalsRepository(
  config,
  client = createHttpClient({ baseUrl: config.apiBaseUrl }),
  { getAccessToken = async () => null } = {},
) {
  async function headers(userId) {
    const token = await getAccessToken(userId);
    if (!token)
      throw new ApiError('Войдите в аккаунт, чтобы работать с откликами.', {
        status: 401,
        code: 'UNAUTHORIZED',
      });
    return { Authorization: `Bearer ${token}` };
  }
  return {
    async list({ userId } = {}) {
      return validateProposalList(
        await client.get('/proposals', { headers: await headers(userId) }),
      );
    },
    async submit(value, { userId } = {}) {
      const payload = validateProposalWrite(value);
      return validateProposal(
        await client.request('/proposals', {
          method: 'POST',
          headers: { ...(await headers(userId)), 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }),
      );
    },
    async decide(id, value, { userId } = {}) {
      if (
        typeof id !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
      )
        throw new TypeError('Некорректный идентификатор отклика.');
      const payload = validateProposalDecision(value);
      const proposal = validateProposal(
        await client.request(`/proposals/${encodeURIComponent(id)}/decision`, {
          method: 'PATCH',
          headers: { ...(await headers(userId)), 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }),
      );
      if (proposal.id.toLowerCase() !== id.toLowerCase() || proposal.status !== payload.status)
        throw new ApiError('Сервер вернул некорректный результат решения.', {
          code: 'INVALID_RESPONSE',
        });
      return proposal;
    },
  };
}
