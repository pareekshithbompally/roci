/** Apple Speech's next setup step (allow Speech Recognition, then download the model); null once it can run. */

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSettings } from '@shared/contexts/SettingsContext';
import { queryKeys } from '@shared/query/queryKeys';
import { isIntegrationEnabled } from '@shared/utils/integrations';
import { appleSpeechStep, downloadAppleSpeechModel, requestAppleSpeechAccess } from '@services/ai/transcription';
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

  switch (appleSpeechStep(status)) {
    case 'ask': return { kind: 'allow', busy, percent: null, run: () => after(requestAppleSpeechAccess(), 'request access') };
    case 'denied': return { kind: 'allow', busy: false, percent: null, run: () => after(openNative('speech-recognition-settings'), 'open settings') };
    case 'download': return { kind: 'download', busy, percent: null, run: () => after(downloadAppleSpeechModel(), 'download') };
    default: return null;
  }
}
