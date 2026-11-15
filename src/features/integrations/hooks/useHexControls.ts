/** Hex row: on/off (no macOS permission), whether Hex is running, the meeting stream's state, and "Sync now". */

import { useSettings } from '@shared/contexts/SettingsContext';
import { useHexStatus } from './useIntegrationSpeech';
import { isIntegrationEnabled } from '@shared/utils/integrations';
import { useHexSyncStore } from '@features/integrations/stores/hexSyncStore';
import { openNative } from '@features/integrations/utils/openNative';
import { runHexCatchUp } from './useHexRuntime';
import type { IntegrationControls } from '@features/integrations/types';
import type { HexEventsState } from '@services/hex';

export interface HexControls extends IntegrationControls {
  running: boolean;
  events: HexEventsState | null;
  syncing: boolean;
  syncError: string | null;
  syncNow: () => void;
  openHex: () => void;
}

export function useHexControls(): HexControls {
  const { settings, setSettings } = useSettings();
  const enabled = isIntegrationEnabled(settings, 'hex');
  const { data: status } = useHexStatus(enabled);
  const events = useHexSyncStore((s) => s.events);
  const syncing = useHexSyncStore((s) => s.syncing);
  const syncError = useHexSyncStore((s) => s.error);

  return {
    access: 'ready',
    enabled,
    setEnabled: (on) => setSettings({ hexIntegration: { enabled: on } }),
    running: !!status?.running,
    events,
    syncing,
    syncError,
    syncNow: () => { void runHexCatchUp(); },
    openHex: () => { openNative('hex-app').catch((e: unknown) => console.error('[useHexControls] open Hex failed:', e)); },
  };
}
