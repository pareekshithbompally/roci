import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';

/** Self-hosted Silero VAD assets; the Ort WASM pair must come from vad-web's own nested onnxruntime-web. */
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
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        __PLATFORM_MACOS__: process.env.TAURI_ENV_PLATFORM === 'darwin',
        __PLATFORM_WINDOWS__: process.env.TAURI_ENV_PLATFORM === 'windows',
        __PLATFORM_LINUX__: process.env.TAURI_ENV_PLATFORM === 'linux',
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
    };
});
