/** A reply that failed: the provider's message in the callout's own text; its raw payload behind a disclosure, offered only
 *  when it says more than the message. */

import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Callout, IconButton, Surface, Text } from '@shared/ui';
import { readableErrorText } from '@shared/utils/errors';
import { CHAT_ERROR_COPY } from '@config/chat.config';

interface ErrorMessageBoxProps {
  errorText: string;
}

const ErrorMessageBox: React.FC<ErrorMessageBoxProps> = ({ errorText }) => {
  const [expanded, setExpanded] = useState(false);
  const message = readableErrorText(errorText) ?? CHAT_ERROR_COPY.unknown;
  const raw = errorText.trim();
  const details = raw !== message && raw.replace(/^Error:\s*/, '') !== message ? raw : null;

  return (
    <Callout
      variant="error"
      action={details && (
        <IconButton
          icon={expanded ? ChevronDown : ChevronRight}
          label={expanded ? CHAT_ERROR_COPY.hideDetails : CHAT_ERROR_COPY.showDetails}
          size="sm"
          variant="dangerGhost"
          onClick={() => setExpanded(!expanded)}
        />
      )}
    >
      <Text as="p" variant="label" tone="inherit" className="break-words">{message}</Text>
      {expanded && details && (
        <Surface variant="subtle" radius="md" className="mt-2 overflow-x-auto p-3">
          <Text as="div" variant="mono" tone="inherit" className="whitespace-pre-wrap">{details}</Text>
        </Surface>
      )}
    </Callout>
  );
};

export default ErrorMessageBox;
