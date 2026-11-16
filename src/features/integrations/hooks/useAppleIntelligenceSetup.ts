/** One-click Apple setup: chat, summaries, speech recognition and read aloud on Apple's on-device models. */

import { useQueryClient } from '@tanstack/react-query';
import { useSettings } from '@shared/contexts/SettingsContext';
import { queryKeys } from '@shared/query/queryKeys';
import { failureLogger } from '@shared/utils/errors';
import { prepareAppleSpeech } from '@services/ai/transcription';
import { APPLE_INTELLIGENCE } from '@config/providers.config';
import { TRANSCRIPTION_CONFIG } from '@config/transcription.config';
import { READ_ALOUD_CONFIG } from '@config/readAloud.config';
import type { AppSettings } from '@shared/types';
import { useAppleIntelligenceControls } from './useAppleIntelligenceControls';

const report = failureLogger('useAppleIntelligenceSetup');

/** Chat, summaries and read aloud on Apple's models, the integration that offers them switched on. */
const APPLE_DEFAULTS: Partial<AppSettings> = {
  appleIntelligenceIntegration: { enabled: true },
  chatModel: APPLE_INTELLIGENCE.model,
  analyzeModel: APPLE_INTELLIGENCE.model,
  readAloudEngine: READ_ALOUD_CONFIG.macos.id,
  readAloudVoice: undefined,
};

/** Speech recognition on Apple Speech: chosen only once it can run, so a denial keeps the current engine. */
const APPLE_SPEECH: Partial<AppSettings> = {
  transcriptionProvider: TRANSCRIPTION_CONFIG.appleSpeech.provider,
  transcriptionModel: TRANSCRIPTION_CONFIG.appleSpeech.model,
};

export interface AppleIntelligenceSetup {
  /** Off in System Settings: `setUp` opens that pane instead. */
  needsSettings: boolean;
  setUp: () => void;
}

/** Null where this Mac can't run Apple Intelligence (or its status isn't known yet). */
export function useAppleIntelligenceSetup(): AppleIntelligenceSetup | null {
  const { access, openSettings } = useAppleIntelligenceControls();
  const { setSettings } = useSettings();
  const queryClient = useQueryClient();
  if (access !== 'ready' && access !== 'needs-settings') return null;

  const setUp = () => {
    if (access === 'needs-settings') return openSettings();
    setSettings(APPLE_DEFAULTS);
    prepareAppleSpeech()
      .then((ready) => {
        if (ready) setSettings(APPLE_SPEECH);
        return queryClient.invalidateQueries({ queryKey: queryKeys.appleSpeechStatus() });
      })
      .catch(report('speech setup'));
  };

  return { needsSettings: access === 'needs-settings', setUp };
}
