import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';

/** Self-hosted Silero VAD assets; the Ort WASM pair must come from vad-web's own nested onnxruntime-web. */
const VAD_ORT_DIR = 'node_modules/@ricky0123/vad-web/node_modules/onnxruntime-web/dist';


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
  // Bundled at start: first met during a recording (a live chunk's VAD), dev would bundle it then and reload the window.
  optimizeDeps: { include: ['@ricky0123/vad-web'] },
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        {
          src: 'node_modules/@ricky0123/vad-web/dist/silero_vad_legacy.onnx',
          dest: 'models',
          rename: { stripBase: true, name: 'silero_vad_legacy.onnx' },
        },
        // Exactly the pair the loader fetches; both resolve under wasmPaths, so both live flat in dist/ort/.
        {
          src: `${VAD_ORT_DIR}/ort-wasm-simd-threaded.jsep.mjs`,
          dest: 'ort',
          rename: { stripBase: true, name: 'ort-wasm-simd-threaded.jsep.mjs' },
        },
        {
          src: `${VAD_ORT_DIR}/ort-wasm-simd-threaded.jsep.wasm`,
          dest: 'ort',
          rename: { stripBase: true, name: 'ort-wasm-simd-threaded.jsep.wasm' },
        },
      ],
    }),
  ],
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
