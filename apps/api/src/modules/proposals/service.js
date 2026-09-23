import {
  validateProposal,
  validateProposalList,
  validateProposalWrite,
  validateProposalDecision,
} from '@ai-sana/contracts';
import { readBearerToken } from '../auth/service.js';
import { HttpError } from '../../shared/http-error.js';
import { readJsonBody } from '../../shared/json-body.js';

export function createProposalService(repository, authService) {
  async function identity(request, requiredRole = null) {
    const { user, profile } = await authService.getCurrentUser(request);
    if (
      !['student', 'business'].includes(profile.role) ||
      (requiredRole && profile.role !== requiredRole)
    ) {
      throw new HttpError(
        403,
        'PROPOSALS_FORBIDDEN',
        requiredRole === 'student'
          ? 'Предлагать решение может только студент.'
          : requiredRole === 'business'
            ? 'Принимать или отклонять отклики может только владелец бизнес-задачи.'
            : 'Нет доступа к откликам.',
      );
    }
    return { userId: user.id, role: profile.role, accessToken: readBearerToken(request) };
  }
  return {
    async list(request) {
      return validateProposalList(await repository.list(await identity(request)));
    },
    async create(request) {
      const actor = await identity(request, 'student');
      const body = await readJsonBody(request);
      let input;
      try {
        input = validateProposalWrite(body);
      } catch (error) {
        throw new HttpError(400, 'INVALID_PROPOSAL', error.message);
      }
      return validateProposal(await repository.create(input, actor));
    },
    async decide(rawId, request) {
      const actor = await identity(request, 'business');
      if (
        typeof rawId !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawId)
      ) {
        throw new HttpError(400, 'INVALID_PROPOSAL_ID', 'Некорректный идентификатор отклика.');
      }
      const body = await readJsonBody(request, 4096);
      let input;
      try {
        input = validateProposalDecision(body);
      } catch (error) {
        throw new HttpError(400, 'INVALID_PROPOSAL_DECISION', error.message);
      }
      return validateProposal(await repository.decide(rawId.toLowerCase(), input, actor));
    },
  };
}
