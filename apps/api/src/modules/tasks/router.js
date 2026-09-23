import { API_PATHS } from '@ai-sana/contracts';

/** Resolve a read operation; execution happens after HTTP method validation. */
export function createTaskRouter(service) {
  return {
    resolve(pathname) {
      if (pathname === API_PATHS.tasks) return () => service.list();
      const match = /^\/api\/tasks\/([^/]+)$/.exec(pathname);
      if (match) return () => service.findById(match[1]);
      return null;
    },
  };
}
