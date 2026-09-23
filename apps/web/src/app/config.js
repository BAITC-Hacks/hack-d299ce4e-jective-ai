export function readConfig(env = import.meta.env ?? {}) {
  return Object.freeze({
    dataSource: 'api',
    apiBaseUrl: env.VITE_API_BASE_URL || '/api',
    supabaseUrl: (env.VITE_SUPABASE_URL || '').trim(),
    supabaseKey: (env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY || '').trim(),
  });
}
