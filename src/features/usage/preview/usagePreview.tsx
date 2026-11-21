/** Dev-only: Settings › Usage rendered in the app's own providers, over a simulated store (`fixture.ts`). Not in the bundle. */

import ReactDOM from 'react-dom/client';
import { mockIPC, mockWindows } from '@tauri-apps/api/mocks';
import { AppProviders } from '@/src/app/AppProviders';
import { Surface } from '@shared/ui';
import { UsagePanel } from '@features/usage';
import type { UsageQuery } from '@extensions/usage';
import { usageSummary } from './fixture';
import '@/index.css';

const HANDLERS: Record<string, (args: Record<string, unknown>) => unknown> = {
  'plugin:store|initialize': () => null,
  'plugin:store|settings_get_all': () => [],
  'plugin:store|providers_list': () => [],
  'plugin:store|get_usage_summary': (args) => usageSummary(args.query as UsageQuery),
  local_models: () => [],
};

mockIPC((cmd, args) => HANDLERS[cmd]?.((args ?? {}) as Record<string, unknown>) ?? null);
mockWindows('main');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <AppProviders>
    <Surface variant="page" className="min-h-screen">
      <UsagePanel />
    </Surface>
  </AppProviders>,
);
