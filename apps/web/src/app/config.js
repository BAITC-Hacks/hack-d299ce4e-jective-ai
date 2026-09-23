export function readConfig(env = import.meta.env ?? {}) {
  const dataSource = env.VITE_DATA_SOURCE || 'mock';
  if (!['mock', 'api'].includes(dataSource)) {
    throw new Error('VITE_DATA_SOURCE должен быть mock или api.');
  }

  return Object.freeze({
    dataSource,
    apiBaseUrl: env.VITE_API_BASE_URL || '/api',
    supabaseUrl: (env.VITE_SUPABASE_URL || '').trim(),
    supabaseKey: (env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY || '').trim(),
  });
}
