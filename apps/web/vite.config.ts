import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { msw } from 'msw/vite';

export default defineConfig({
  plugins: [
    react(),
    // Serves mockServiceWorker.js in dev and emits it into the build: the
    // published demo runs the ranking/history mocks too.
    msw({ mode: 'worker-only' }),
  ],
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  build: { target: 'es2022', sourcemap: true },
});
