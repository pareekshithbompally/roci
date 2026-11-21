import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  server: {
    port: 5173,
    // devUrl points at 5173: a second dev server must fail, not drift to 5174 and leave the app on the other one.
    strictPort: true,
    host: '0.0.0.0',
    // Prepare the app's whole module graph at start, so the first launch is answered at once, not file by file.
    warmup: { clientFiles: ['./index.tsx'] },
  },
  worker: {
    format: 'es',
  },
  plugins: [react()],
  define: {
    __TAURI_PLATFORM__: JSON.stringify(process.env.TAURI_ENV_PLATFORM ?? ''),
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, '.'),
      '@app': path.resolve(import.meta.dirname, './src/app'),
      '@features': path.resolve(import.meta.dirname, './src/features'),
      '@core': path.resolve(import.meta.dirname, './src/core'),
      '@shared': path.resolve(import.meta.dirname, './src/shared'),
      '@platform': path.resolve(import.meta.dirname, './src/platform'),
      '@config': path.resolve(import.meta.dirname, './src/config'),
      '@assets': path.resolve(import.meta.dirname, './src/assets'),
      '@extensions': path.resolve(import.meta.dirname, './src/extensions'),
      '@services': path.resolve(import.meta.dirname, './src/services'),
    }
  }
});
