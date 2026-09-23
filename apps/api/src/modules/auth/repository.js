import { HttpError } from '../../shared/http-error.js';

export function authUnavailable() {
  return new HttpError(
    503,
    'AUTH_UNAVAILABLE',
    'Authentication service is temporarily unavailable.',
  );
}

export function unauthorized() {
  return new HttpError(401, 'UNAUTHORIZED', 'A valid sign-in session is required.');
}

/** This adapter always uses a request-scoped client with the user's access token. */
export function createAuthRepository(client) {
  return {
    async getUser(accessToken) {
      let result;
      try {
        result = await client.auth.getUser(accessToken);
      } catch {
        throw authUnavailable();
      }
      if (result.error) {
        if (
          [400, 401, 403].includes(result.error.status) ||
          result.error.code === 'user_not_found'
        ) {
          throw unauthorized();
        }
        throw authUnavailable();
      }
      if (!result.data?.user) throw unauthorized();
      return result.data.user;
    },

    async findProfile(userId) {
      let result;
      try {
        result = await client
          .from('profiles')
          .select('id,full_name,role,created_at,updated_at')
          .eq('id', userId)
          .maybeSingle();
      } catch {
        throw authUnavailable();
      }
      if (result.error) throw authUnavailable();
      if (!result.data) {
        throw new HttpError(404, 'PROFILE_NOT_FOUND', 'Account profile was not found.');
      }
      return result.data;
    },
  };
}
