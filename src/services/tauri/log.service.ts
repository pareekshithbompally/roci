/** Web-side warnings and errors go to Roci's log file too (~/Library/Logs/ai.roci.roci/), as Tauri's logging guide
 *  forwards the console; so do errors nothing caught. The console keeps working as before. */

import { error, warn } from '@tauri-apps/plugin-log';
import { isTauriEnvironment } from './environment.service';

type Level = 'warn' | 'error';
const WRITE: Record<Level, (message: string) => Promise<void>> = { warn, error };

/** One argument as log text: errors with their stack, objects as JSON (String() when they can't be). */
function describe(arg: unknown): string {
  if (typeof arg === 'string') return arg;
  if (arg instanceof Error) return arg.stack ?? arg.message;
  try {
    return JSON.stringify(arg) ?? String(arg);
  } catch {
    return String(arg);
  }
}

const text = (args: unknown[]) => args.map(describe).join(' ');

function forward(level: Level): void {
  const original = console[level].bind(console);
  console[level] = (...args: unknown[]) => {
    original(...args);
    WRITE[level](text(args)).catch(() => {}); // the log itself failing has nowhere left to go
  };
}

export function forwardConsoleToLog(): void {
  if (!isTauriEnvironment()) return;
  forward('warn');
  forward('error');
  window.addEventListener('error', (event) => console.error('[Uncaught]', event.error ?? event.message));
  window.addEventListener('unhandledrejection', (event) => console.error('[Unhandled rejection]', event.reason));
}
