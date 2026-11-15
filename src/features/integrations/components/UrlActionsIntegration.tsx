/** URL actions rows: every `kasset://` link Kasset answers, with a copy button. */

import React from 'react';
import { Copy } from 'lucide-react';
import { CardRow, Code, IconButton } from '@shared/ui';
import { useToast } from '@shared/contexts/ToastContext';
import { copyRichText } from '@shared/utils/clipboard';
import { INTEGRATIONS_CONFIG } from '@config/integrations.config';

const COPY = INTEGRATIONS_CONFIG.urlActions;

export const UrlActionsIntegration: React.FC = () => {
  const { showToast } = useToast();
  const copy = (url: string) => {
    copyRichText(url)
      .then(() => showToast(COPY.copied, 'success'))
      .catch((e: unknown) => console.error('[UrlActionsIntegration] copy failed:', e));
  };

  return (
    <>
      {COPY.actions.map(({ url, description }) => (
        <CardRow
          key={url}
          title={<Code>{url}</Code>}
          description={description}
          actions={<IconButton icon={Copy} label={COPY.copy} size="sm" onClick={() => copy(url)} />}
        />
      ))}
    </>
  );
};
