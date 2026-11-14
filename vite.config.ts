import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';

/**
 * Self-hosted Silero VAD assets (local-first: no CDN, works offline).
 * The Ort WASM pair must come from vad-web's own nested onnxruntime-web copy —
 * the version its bundled JS was built against — not the hoisted one.
 */
const VAD_ORT_DIR = 'node_modules/@ricky0123/vad-web/node_modules/onnxruntime-web/dist';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 5173,
        host: '0.0.0.0',
      },
      worker: {
        format: 'es',
      },
      plugins: [
        react(),
        viteStaticCopy({
          targets: [
            {
              src: 'node_modules/@ricky0123/vad-web/dist/silero_vad_legacy.onnx',
              dest: 'models',
              rename: { stripBase: true, name: 'silero_vad_legacy.onnx' },
            },
            // Exactly the pair the loader fetches (verified in headless Chrome):
            // both resolve under wasmPaths, so both live flat in dist/ort/.
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
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        __PLATFORM_MACOS__: process.env.TAURI_ENV_PLATFORM === 'darwin',
        __PLATFORM_WINDOWS__: process.env.TAURI_ENV_PLATFORM === 'windows',
        __PLATFORM_LINUX__: process.env.TAURI_ENV_PLATFORM === 'linux',
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
          '@app': path.resolve(__dirname, './src/app'),
          '@features': path.resolve(__dirname, './src/features'),
          '@core': path.resolve(__dirname, './src/core'),
          '@shared': path.resolve(__dirname, './src/shared'),
          '@platform': path.resolve(__dirname, './src/platform'),
          '@config': path.resolve(__dirname, './src/config'),
          '@assets': path.resolve(__dirname, './src/assets'),
          '@extensions': path.resolve(__dirname, './src/extensions'),
          '@services': path.resolve(__dirname, './src/services'),
        }
      }
    };
});
