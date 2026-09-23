import { createClient } from '@supabase/supabase-js';

/** Use only a publishable/anon key; access remains enforced by RLS and the API. */
export function createBrowserSupabase(config, clientFactory = createClient) {
  const { supabaseUrl: url, supabaseKey: key } = config;
  if (!url || !key) return null;
  const parsedUrl = new URL(url);
  if (
    parsedUrl.username ||
    parsedUrl.password ||
    parsedUrl.search ||
    parsedUrl.hash ||
    parsedUrl.pathname !== '/'
  ) {
    throw new Error('Supabase URL must be a project origin without credentials, path or query.');
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(parsedUrl.hostname);
  if (parsedUrl.protocol !== 'https:' && !(parsedUrl.protocol === 'http:' && local)) {
    throw new Error('Supabase requires HTTPS or a local development URL.');
  }
  if (key.startsWith('sb_publishable_') && !/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) {
    throw new Error('Invalid Supabase publishable key.');
  }
  if (!key.startsWith('sb_publishable_')) {
    let role;
    try {
      const payload = key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      role = JSON.parse(atob(payload)).role;
    } catch {
      throw new Error('A Supabase publishable or anon key is required.');
    }
    if (role !== 'anon')
      throw new Error('A secret/service_role key cannot be used in the browser.');
  }
  return clientFactory(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
}
