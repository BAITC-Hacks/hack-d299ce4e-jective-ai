import { isIP } from 'node:net';

/** Only public Supabase keys are needed; requests retain the user's RLS policies. */
export function readSupabaseConfig(env = process.env) {
  const rawUrl = env.SUPABASE_URL?.trim();
  const publishableKey = (env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY)?.trim();
  if (!rawUrl && !publishableKey) return null;
  if (!rawUrl || !publishableKey) {
    throw new TypeError('Set both SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY.');
  }

  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new TypeError('SUPABASE_URL must be a valid project URL.');
  }
  const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLocal)) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  ) {
    throw new TypeError('SUPABASE_URL must be an HTTPS project URL (HTTP is allowed on loopback).');
  }

  let isPublic = /^sb_publishable_[a-z\d_-]+$/i.test(publishableKey);
  if (!isPublic && /^[a-z\d_-]+\.[a-z\d_-]+\.[a-z\d_-]+$/i.test(publishableKey)) {
    try {
      // This only rejects privileged configuration keys; it never authenticates a user.
      const payload = JSON.parse(Buffer.from(publishableKey.split('.')[1], 'base64url').toString());
      isPublic = payload.role === 'anon';
    } catch {
      isPublic = false;
    }
  }
  if (!isPublic || publishableKey.length > 16_384) {
    throw new TypeError('SUPABASE_PUBLISHABLE_KEY must be a publishable or legacy anon key.');
  }

  return { url: url.origin, publishableKey };
}

export function readServerConfig(env = process.env) {
  const portValue = env.PORT ?? '3001';
  const port = Number(portValue);
  if (!/^\d+$/.test(portValue) || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new TypeError('PORT must be an integer between 1 and 65535.');
  }

  const host = env.HOST ?? '127.0.0.1';
  const isHostname =
    typeof host === 'string' &&
    host.length <= 253 &&
    host.split('.').every((label) => /^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/i.test(label));
  if (typeof host !== 'string' || (!isIP(host) && !isHostname)) {
    throw new TypeError('HOST must be an IP address or hostname.');
  }
  return { host, port };
}
