import { createServer } from 'node:http';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { readServerConfig, readSupabaseConfig } from './config.js';
import { createSupabaseAuthService } from './modules/auth/service.js';
import { createSupabaseTaskRepository } from './modules/tasks/repository.js';
import { createSupabaseProposalRepository } from './modules/proposals/repository.js';

try {
  try {
    loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url)));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const { host, port } = readServerConfig();
  const config = readSupabaseConfig();
  const authService = createSupabaseAuthService({ config });
  const taskRepository = createSupabaseTaskRepository({ config });
  const proposalRepository = createSupabaseProposalRepository({ config });
  const server = createServer(createApp({ authService, taskRepository, proposalRepository }));
  server.on('error', (error) => {
    console.error(`API failed to start: ${error.message}`);
    process.exitCode = 1;
  });
  server.listen(port, host, () => {
    const address = host.includes(':') ? `[${host}]` : host;
    console.log(`AI Sana API: http://${address}:${port}`);
  });

  let closing = false;
  const shutdown = () => {
    if (closing) return;
    closing = true;
    const timeout = setTimeout(() => {
      console.error('API shutdown timed out; closing active connections.');
      server.closeAllConnections();
      process.exitCode = 1;
    }, 10_000);
    timeout.unref();
    server.close((error) => {
      clearTimeout(timeout);
      if (error) {
        console.error(`API shutdown failed: ${error.message}`);
        process.exitCode = 1;
      }
    });
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
} catch (error) {
  console.error(`API configuration error: ${error.message}`);
  process.exitCode = 1;
}
