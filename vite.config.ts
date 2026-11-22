import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// npm run dev / build : 일반 웹앱. /api 는 Python RAG 서버(`python -m rag.server`, 포트 8000)로 넘긴다.
// 127.0.0.1 instead of "localhost": the API binds IPv4, and on machines where
// localhost resolves to ::1 the proxy would otherwise fail.
// npm run build:file : 서버 없이 더블클릭으로 여는 HTML 파일 하나 (mode "file").
//   Chrome은 file:// 에서 분리된 JS 파일을 불러오지 못하므로 JS·CSS·exceljs를 모두 HTML 안에 넣는다.
export default defineConfig(({ mode }) =>
  mode === 'file'
    ? {
        plugins: [react(), viteSingleFile()],
        build: { outDir: 'dist-file', chunkSizeWarningLimit: 2000 }
      }
    : {
        plugins: [react()],
        // exceljs (~940 kB) is a separate chunk loaded only when saving to Excel
        build: { chunkSizeWarningLimit: 1000 },
        server: {
          proxy: {
            '/api': {
              target: 'http://127.0.0.1:8000',
              changeOrigin: false
            }
          }
        }
      }
);
