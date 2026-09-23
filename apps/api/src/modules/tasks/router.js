import { API_PATHS } from '@ai-sana/contracts';

/** Resolve without executing, so unsupported methods cannot mutate data. */
export function createTaskRouter(service) {
  return {
    resolve(pathname, request) {
      if (pathname === API_PATHS.taskWorkspace)
        return {
          methods: ['GET', 'HEAD', 'PUT'],
          execute: () =>
            request.method === 'PUT'
              ? service.saveWorkspace(request)
              : service.getWorkspace(request),
        };
      if (pathname === API_PATHS.tasks)
        return {
          methods: ['GET', 'HEAD', 'POST'],
          execute: () => (request.method === 'POST' ? service.save(request) : service.list()),
        };
      if (pathname === API_PATHS.myTasks)
        return { methods: ['GET', 'HEAD'], execute: () => service.listMine(request) };
      const match = /^\/api\/tasks\/([^/]+)$/.exec(pathname);
      if (match) return { methods: ['GET', 'HEAD'], execute: () => service.findById(match[1]) };
      return null;
    },
  };
}
