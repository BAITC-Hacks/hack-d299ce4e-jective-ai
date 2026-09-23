import { isIP } from 'node:net';

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
