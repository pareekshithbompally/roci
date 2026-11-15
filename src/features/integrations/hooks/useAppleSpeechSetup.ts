/**
 * useAppleSpeechSetup — the one step Apple Speech still needs, for its row in
 * Settings › Capabilities › Speech recognition: allow Speech Recognition (the
 * macOS prompt, or System Settings once denied), then download the language's
 * speech model. Null once it can transcribe, or while Apple Intelligence is off.
 */

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSettings } from '@shared/contexts/SettingsContext';
import { queryKeys } from '@shared/query/queryKeys';
import { isIntegrationEnabled } from '@shared/utils/integrations';
import { appleIntelligence } from '@services/ai/apple/appleIntelligence.service';
import { TRANSCRIPTION_CONFIG } from '@config/transcription.config';
import { openNative } from '@features/integrations/utils/openNative';
import type { ChoiceSetup } from '@shared/utils/modelResolver';
import { useAppleSpeechStatus } from './useIntegrationSpeech';
import { failureLogger } from '@shared/utils/errors';

const report = failureLogger('useAppleSpeechSetup');

export function useAppleSpeechSetup(): ChoiceSetup | null {
  const queryClient = useQueryClient();
  const { settings } = useSettings();
  const { data: status } = useAppleSpeechStatus(isIntegrationEnabled(settings, 'appleIntelligence'));
  const [busy, setBusy] = useState(false);

  const after = (work: Promise<unknown>, action: string) => {
    setBusy(true);
    work
      .then(() => queryClient.invalidateQueries({ queryKey: queryKeys.appleSpeechStatus() }))
      .catch(report(action))
      .finally(() => setBusy(false));
  };

  if (!status?.available) return null;
  if (status.authorization === 'not_determined') {
    return { kind: 'allow', busy, percent: null, run: () => after(appleIntelligence.speechRequestAccess(), 'request access') };
  }
  if (status.authorization !== 'authorized') {
    return { kind: 'allow', busy: false, percent: null, run: () => after(openNative('speech-recognition-settings'), 'open settings') };
  }
  if (!status.installed) {
    return { kind: 'download', busy, percent: null, run: () => after(appleIntelligence.speechPrepare(TRANSCRIPTION_CONFIG.language), 'download') };
  }
  return null;
}
