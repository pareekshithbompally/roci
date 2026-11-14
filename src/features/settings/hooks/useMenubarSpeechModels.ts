/**
 * Keeps the tray's Speech Model submenu in step with Hex's downloaded models
 * and the selected speech engine (Hex: `status_item::update_transcription`).
 *
 * The tray is backend-owned, so it can't read the app's settings: this hook
 * reports the list it should show. Picking a row comes back as
 * `speech_model:<id>` and is applied in `App.tsx`.
 */

import { useEffect, useMemo } from 'react';
import { isTauriEnvironment, menubarService, type MenubarSpeechModel } from '@services/tauri';
import { installedHexModels } from '@services/ai/transcription';
import { useSettings } from '@shared/contexts/SettingsContext';
import { useHexStatus } from './useSpeechModels';
import { TRANSCRIPTION_CONFIG } from '@config/transcription.config';

export function useMenubarSpeechModels(): void {
  const { settings } = useSettings();
  const { data: hexStatus } = useHexStatus();

  const models = useMemo<MenubarSpeechModel[]>(() => {
    const installed = installedHexModels(hexStatus);
    // The Hex engine falls back to the first downloaded model when no
    // specific one was chosen (see `defaultHexModel` in services/ai/transcription).
    const selectedId = settings.transcriptionProvider === TRANSCRIPTION_CONFIG.hexProvider
      ? settings.transcriptionModel || installed[0]?.id
      : undefined;
    return installed.map((model) => ({
      id: model.id,
      name: model.name,
      selected: model.id === selectedId,
    }));
  }, [hexStatus, settings.transcriptionProvider, settings.transcriptionModel]);

  useEffect(() => {
    if (!isTauriEnvironment()) return;
    void menubarService.setSpeechModels(models);
  }, [models]);
}
