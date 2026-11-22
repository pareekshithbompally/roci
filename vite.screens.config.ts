/** Roci's MCP App screens (`src/screens`), each built into one self-contained HTML page in `public/screens`, which the app
 *  then serves with itself; Roci's MCP server hands it to agents' apps. Same aliases and plugins as the app. */

import path from 'path';
import { defineConfig, mergeConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import app from './vite.config.ts';
import pkg from './package.json' with { type: 'json' };

const root = path.resolve(import.meta.dirname, 'src/screens');

export default mergeConfig(app, defineConfig({
  root,
  publicDir: false,
  plugins: [viteSingleFile()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  css: { postcss: import.meta.dirname },
  build: {
    outDir: path.resolve(import.meta.dirname, 'public/screens'),
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(root, 'meetings.html'),
      // A screen imports the kit through its barrel; only stylesheets run for their effect, so the rest of the kit
      // (charts, dialogs…) is left out of the page.
      treeshake: { moduleSideEffects: (id) => id.endsWith('.css') },
    },
  },
}));
