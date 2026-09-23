import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import tailwindcss from '@tailwindcss/vite';

const webRoot = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, webRoot, '');
  const proxy = {
    '/api': {
      target: env.API_TARGET || 'http://127.0.0.1:3001',
      changeOrigin: true,
    },
  };

  return {
    root: webRoot,
    plugins: [tailwindcss()],
    server: { host: '127.0.0.1', port: 3000, strictPort: true, proxy },
    preview: { host: '127.0.0.1', port: 3000, strictPort: true, proxy },
  };
});
