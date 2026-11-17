import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The RAG backend is a separate local process (`python -m rag.server`, port 8000).
// Everything under /api is proxied there so the browser talks to one origin.
// 127.0.0.1 instead of "localhost": the API binds IPv4, and on machines where
// localhost resolves to ::1 the proxy would otherwise fail.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: false,
      },
    },
  },
});
