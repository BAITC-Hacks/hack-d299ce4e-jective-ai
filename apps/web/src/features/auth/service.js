import { validateAuthUserResponse } from '@ai-sana/contracts';

export function createAuthService({ supabase, apiClient, redirectUrl }) {
  function requireClient() {
    if (!supabase)
      throw Object.assign(new Error('Auth is unavailable.'), { code: 'AUTH_NOT_CONFIGURED' });
    return supabase;
  }
  return {
    configured: Boolean(supabase),
    async register({ fullName, email, password, role }) {
      const { data, error } = await requireClient().auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { full_name: fullName.trim(), role },
          ...(redirectUrl ? { emailRedirectTo: redirectUrl } : {}),
        },
      });
      if (error) throw error;
      return data;
    },
    async login({ email, password }) {
      const { data, error } = await requireClient().auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
      return data;
    },
    async logout() {
      const { error } = await requireClient().auth.signOut({ scope: 'local' });
      if (error) throw error;
    },
    async getSession() {
      if (!supabase) return null;
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      return data.session;
    },
    async getIdentity(accessToken) {
      return validateAuthUserResponse(
        await apiClient.get('/auth/me', {
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
      );
    },
    subscribe(listener) {
      if (!supabase) return () => {};
      const { data } = supabase.auth.onAuthStateChange(listener);
      return () => data.subscription.unsubscribe();
    },
  };
}
