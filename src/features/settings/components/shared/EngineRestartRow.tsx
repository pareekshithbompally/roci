/** The Mac's on-device engine (llama.cpp's server): settings written into its setup apply after a restart, offered once
 *  one would apply them. */

import React from 'react';
import { RotateCw } from 'lucide-react';
import { Button, CardRow, IconTile, Text } from '@shared/ui';
import { HelpLabel } from '@shared/components';
import { LOCAL_MODELS_CONFIG } from '@config/localModels.config';
import { useOnDeviceRestart } from '@features/settings/hooks/useOnDeviceRestart';

const COPY = LOCAL_MODELS_CONFIG.engine.restart;

export const EngineRestartRow: React.FC = () => {
  const { pending, restarting, restart } = useOnDeviceRestart();
  return (
    <CardRow
      leading={<IconTile icon={RotateCw} />}
      title={<HelpLabel label={COPY.title} help={COPY.help} />}
      status={pending ? <Text tone="muted">{COPY.pending}</Text> : undefined}
      actions={<Button variant="outline" onClick={restart} disabled={!pending} loading={restarting}>{COPY.action}</Button>}
    />
  );
};
