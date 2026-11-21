/** Where Roci keeps its data: the folder as a row, its path copied with an icon, Show in Finder with Finder's own icon; only
 *  where there is a file manager (a Mac). */

import React from 'react';
import { Check, Copy, FolderOpen } from 'lucide-react';
import { CardRow, Icon, IconButton, Section, Text } from '@shared/ui';
import { ShowInFinderButton } from '@shared/components';
import { StorageConfig } from '@config/storage.config';
import { useCopiedFlag } from '@shared/hooks';
import { useSystemInfo } from '@features/settings/hooks/useSystemInfo';
import { PENDING } from './shared';

const ACTIONS = StorageConfig.actions;

export const StorageLocationSection: React.FC = () => {
  const { storagePath, storagePathError } = useSystemInfo();
  const { copied, markCopied } = useCopiedFlag();

  const copyPath = async () => {
    if (!storagePath) return;
    try {
      await navigator.clipboard.writeText(storagePath);
      markCopied();
    } catch (error: unknown) {
      console.error('[StorageLocationSection] Failed to copy storage path:', error);
    }
  };

  return (
    <Section title="Location" footer={storagePathError && <Text as="span" variant="helper" tone="danger">{storagePathError}</Text>}>
      <CardRow
        leading={<Icon icon={FolderOpen} size="sm" tone="faint" />}
        title={<Text tone="muted" truncate>{storagePath ?? PENDING}</Text>}
        actions={
          <>
            <IconButton icon={copied ? Check : Copy} label={ACTIONS.copyPath} size="sm" disabled={!storagePath} onClick={() => void copyPath()} />
            <ShowInFinderButton path={storagePath} />
          </>
        }
      />
    </Section>
  );
};
