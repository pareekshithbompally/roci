/** Keeps on-device speech recognition's vocabulary in step with Settings (sent at launch and on every change). */

import { useEffect } from 'react';
import { isTauriEnvironment } from '@services/tauri';
import { setSpeechVocabulary } from '@services/ai/transcription/onDevice';
import { platform } from '@platform/index';
import { failureLogger } from '@shared/utils/errors';
import { usePersonalization } from '@features/personalization/hooks/usePersonalization';

const report = failureLogger('useSpeechVocabulary');

export function useSpeechVocabulary(): void {
  const { vocabulary, recognitionBoost } = usePersonalization();
  useEffect(() => {
    if (!platform.hasLocalModels || !isTauriEnvironment()) return;
    setSpeechVocabulary(vocabulary, recognitionBoost).catch(report('set'));
  }, [vocabulary, recognitionBoost]);
}
