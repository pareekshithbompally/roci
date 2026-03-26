import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

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
      plugins: [react()],
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
          '@extensions': path.resolve(__dirname, './extensions'),
        }
      }
    };
});
