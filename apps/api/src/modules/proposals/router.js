import { API_PATHS } from '@ai-sana/contracts';

export function createProposalRouter(service) {
  return {
    resolve(pathname, request) {
      const decision = /^\/api\/proposals\/([^/]+)\/decision$/.exec(pathname);
      if (decision)
        return { methods: ['PATCH'], execute: () => service.decide(decision[1], request) };
      if (pathname !== API_PATHS.proposals) return null;
      return {
        methods: ['GET', 'HEAD', 'POST'],
        execute: () =>
          request.method === 'POST' ? service.create(request) : service.list(request),
      };
    },
  };
}
