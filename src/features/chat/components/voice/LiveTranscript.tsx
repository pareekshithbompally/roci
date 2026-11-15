/**
 * LiveTranscript — dictation as it's spoken: one line in a pill below the
 * voice controls, settled words then the latest ones (fainter, still being
 * revised). When the line is full the newest words stay in view and the start
 * is elided. Its size never changes, so the scope and controls never move.
 */

import React from 'react';
import { DOT_SCOPE_CONFIG } from '@config/dotScope.config';
import { Surface, Text } from '@shared/ui';
import type { LiveText } from '@services/ai/transcription';

const { heightPx, placeholder } = DOT_SCOPE_CONFIG.composer.liveText;

export const LiveTranscript: React.FC<{ text: LiveText }> = ({ text }) => {
  const empty = !text.committed && !text.tentative;
  return (
    <Surface variant="floating" radius="full" className="flex w-full items-center px-4" style={{ height: heightPx }}>
      {/* A right-to-left line around left-to-right text: overflow trims the start, not the end. */}
      <Text as="p" variant="headline" truncate dir="rtl" className="w-full text-center" aria-live="polite">
        {empty ? (
          <Text tone="faint">{placeholder}</Text>
        ) : (
          <bdi>
            {text.committed}
            <Text tone="faint">{text.tentative}</Text>
          </bdi>
        )}
      </Text>
    </Surface>
  );
};
