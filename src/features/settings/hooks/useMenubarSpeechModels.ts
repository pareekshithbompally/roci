/** Reports the ready keyless speech models and the selection to the backend-owned tray submenu. */

import { useEffect, useMemo } from 'react';
import { isTauriEnvironment, menubarService, type MenubarSpeechModel } from '@services/tauri';
import { useSettings } from '@shared/contexts/SettingsContext';
import { speechSelectionKey, speechSelectionOf, type SpeechModelOption } from '@services/ai/transcription';
import { TRANSCRIPTION_CONFIG } from '@config/transcription.config';
import { useSpeechModelOptions } from './useSpeechModels';

const { hexProvider, keylessProviders } = TRANSCRIPTION_CONFIG;

export function useMenubarSpeechModels(): void {
  const { settings } = useSettings();
  const options = useSpeechModelOptions();

  const models = useMemo<MenubarSpeechModel[]>(() => {
    const ready = options.filter((o) => o.ready && keylessProviders.includes(o.provider));
    const selection = speechSelectionOf(settings);
    // Hex with no model chosen uses its first downloaded one (`defaultHexModel`).
    const firstHex = ready.find((o) => o.provider === hexProvider);
    const isSelected = (o: SpeechModelOption) =>
      selection?.provider === o.provider && (selection.model === o.model || (!selection.model && o === firstHex));
    return ready.map((o) => ({ id: speechSelectionKey(o), name: o.label, selected: isSelected(o) }));
  }, [options, settings]);

  useEffect(() => {
    if (!isTauriEnvironment()) return;
    void menubarService.setSpeechModels(models);
  }, [models]);
}
