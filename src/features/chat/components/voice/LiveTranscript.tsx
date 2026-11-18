/** Live dictation as one line on the plain surface: it hugs its words, grows to the composer's width, then keeps the newest words in view. */

import React from 'react';
import { DOT_SCOPE_CONFIG } from '@config/dotScope.config';
import { Surface, Text } from '@shared/ui';
import type { LiveText } from '@services/ai/transcription';

const { heightPx, placeholder } = DOT_SCOPE_CONFIG.composer.liveText;

export const LiveTranscript: React.FC<{ text: LiveText }> = ({ text }) => {
  const empty = !text.committed && !text.tentative;
  return (
    <Surface variant="card" radius="full" className="mt-2 inline-flex min-w-0 max-w-full items-center px-4" style={{ height: heightPx }}>
      {/* A right-to-left line around left-to-right text: once it is full, overflow trims the start ("…"), not the newest words. */}
      <Text as="p" variant="body" truncate dir="rtl" className="min-w-0" aria-live="polite">
        {/* bdi keeps the words' own direction, so trailing punctuation stays at the end. */}
        <bdi>
          {empty ? (
            <Text tone="faint">{placeholder}</Text>
          ) : (
            <>
              {text.committed}
              <Text tone="faint">{text.tentative}</Text>
            </>
          )}
        </bdi>
      </Text>
    </Surface>
  );
};
