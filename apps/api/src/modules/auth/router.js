import { API_PATHS } from '@ai-sana/contracts';

export function createAuthRouter(service) {
  return {
    resolve(pathname, request) {
      if (pathname === API_PATHS.authMe) return () => service.getCurrentUser(request);
      return null;
    },
  };
}
