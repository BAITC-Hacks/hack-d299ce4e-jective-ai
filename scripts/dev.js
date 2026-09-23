import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = fileURLToPath(new URL('../apps/web/', import.meta.url));
const apiRoot = fileURLToPath(new URL('../apps/api/', import.meta.url));
const webRequire = createRequire(new URL('../apps/web/package.json', import.meta.url));
const viteBin = join(dirname(webRequire.resolve('vite/package.json')), 'bin/vite.js');
const children = [];
let stopping = false;

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) child.kill('SIGTERM');
}

for (const [cwd, args, env] of [
  [apiRoot, ['--watch', 'src/server.js'], process.env],
  [webRoot, [viteBin], { ...process.env, VITE_DATA_SOURCE: 'api' }],
]) {
  const child = spawn(process.execPath, args, { cwd, env, stdio: 'inherit' });
  children.push(child);
  child.on('error', (error) => {
    console.error(error.message);
    stop(1);
  });
  child.on('exit', (code) => stop(code ?? 1));
}

process.once('SIGINT', () => stop());
process.once('SIGTERM', () => stop());
