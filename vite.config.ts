import { defineConfig, loadEnv } from 'vite';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import react from '@vitejs/plugin-react';
import autoprefixer from 'autoprefixer';
import tailwindcss from 'tailwindcss';

export default defineConfig(({ mode }) => {
    loadEnv(mode, '.', '');
    const workspace = fileURLToPath(new URL('.', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '').toLowerCase();
    const workspaceId = createHash('sha256').update(workspace).digest('hex').slice(0, 16);
    return {
      server: {
        port: 3000,
        strictPort: true,
        host: '0.0.0.0',
        proxy: {
          '/api': {
            target: 'http://127.0.0.1:8000',
            changeOrigin: true,
          },
          '/files': {
            target: 'http://127.0.0.1:8000',
            changeOrigin: true,
          },
        },
      },
      css: {
        postcss: {
          plugins: [tailwindcss(), autoprefixer()],
        },
      },
      plugins: [react(), {
        name: 'galaxai-launcher-readiness',
        configureServer(server) {
          server.middlewares.use('/__galaxai/instance', (request, response) => {
            if (request.method !== 'GET') { response.statusCode = 405; response.end(); return; }
            response.setHeader('Content-Type', 'application/json');
            response.setHeader('Cache-Control', 'no-store');
            response.end(JSON.stringify({ ok: true, app: 'PDF_GalaxAI', workspace_id: workspaceId }));
          });
        },
      }],
      resolve: {
        alias: {
          '@': fileURLToPath(new URL('./frontend/src', import.meta.url)),
        },
      },
    };
});
