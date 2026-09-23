import { createClient } from '@supabase/supabase-js';
import { validateAuthUserResponse } from '@ai-sana/contracts';
import { HttpError } from '../../shared/http-error.js';
import { authUnavailable, createAuthRepository, unauthorized } from './repository.js';

function readBearerToken(request) {
  const header = request.headers?.authorization;
  if (typeof header !== 'string' || header.length > 16_384) throw unauthorized();

  // Reject duplicate authorization headers instead of relying on Node's first-header behavior.
  const rawHeaders = request.rawHeaders ?? [];
  let authorizationCount = 0;
  for (let index = 0; index < rawHeaders.length; index += 2) {
    if (rawHeaders[index].toLowerCase() === 'authorization') authorizationCount += 1;
  }
  if (authorizationCount > 1) throw unauthorized();

  const match = /^Bearer ([a-z\d_-]+\.[a-z\d_-]+\.[a-z\d_-]+)$/i.exec(header);
  if (!match) throw unauthorized();
  return match[1];
}

/** Verifies identity remotely and reads the role from profiles, never user metadata. */
export function createSupabaseAuthService({ config = null, clientFactory = createClient } = {}) {
  return {
    async getCurrentUser(request) {
      if (!config) {
        throw new HttpError(503, 'AUTH_NOT_CONFIGURED', 'Authentication is not configured.');
      }
      const accessToken = readBearerToken(request);
      try {
        const client = clientFactory(config.url, config.publishableKey, {
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
          global: { headers: { Authorization: `Bearer ${accessToken}` } },
        });
        const repository = createAuthRepository(client);
        const user = await repository.getUser(accessToken);
        if (typeof user.id !== 'string' || !user.id) throw authUnavailable();
        const profile = await repository.findProfile(user.id);
        if (profile.id !== user.id) throw authUnavailable();
        return validateAuthUserResponse({ user: { id: user.id, email: user.email }, profile });
      } catch (error) {
        // SDK/transport errors may contain headers or credentials; never propagate/log them.
        if (error instanceof HttpError) throw error;
        throw authUnavailable();
      }
    },
  };
}
