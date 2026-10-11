import { defineConfig, loadEnv } from 'vite';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import autoprefixer from 'autoprefixer';
import tailwindcss from 'tailwindcss';

export default defineConfig(({ mode }) => {
    loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
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
      plugins: [react()],
      resolve: {
        alias: {
          '@': fileURLToPath(new URL('./frontend/src', import.meta.url)),
        },
      },
    };
});
