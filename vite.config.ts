import path from 'path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';

/** Self-hosted Silero VAD assets; the Ort WASM pair must come from vad-web's own nested onnxruntime-web. */
const VAD_ORT_DIR = 'node_modules/@ricky0123/vad-web/node_modules/onnxruntime-web/dist';

/**
 * Dev only. Tauri's iOS dev proxy fetches the app's modules over pooled keep-alive connections; Node closes an idle one
 * after 5 s, and a request sent on a connection just closed fails ("error sending request"), leaving the app on its
 * splash. Holding idle connections open longer than the proxy's pool keeps them reusable.
 */
const KEEP_ALIVE_MS = 120_000;
const keepDevConnectionsAlive: Plugin = {
  name: 'roci:keep-dev-connections-alive',
  apply: 'serve',
  configureServer(server) {
    const http = server.httpServer;
    if (!http || !('keepAliveTimeout' in http)) return;
    http.keepAliveTimeout = KEEP_ALIVE_MS;
    http.headersTimeout = KEEP_ALIVE_MS + 1_000;
  },
};

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
  plugins: [
    keepDevConnectionsAlive,
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
