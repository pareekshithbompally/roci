/** Providers sidebar "Local" group: detected and saved servers on this Mac, with Rescan and Add URL. */

import React, { useState } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { useSettings } from '@shared/contexts/SettingsContext';
import { useToast } from '@shared/contexts/ToastContext';
import { LOCAL_EMPTY_HINT, LOCAL_URL_DRAFT } from '@config/localServers.config';
import { useLocalServers } from '@features/settings/hooks/useLocalServers';
import { ProviderGroup, ProviderListItem } from './ProviderListItem';
import type { LocalRow } from '@services/providers/localServers';
import { Button, IconButton, Input, Text } from '@shared/ui';

interface LocalServersSectionProps {
  selectedProvider: string | null;
  onSelect: (provider: string) => void;
}

function rowDetail(row: LocalRow): string {
  if (!row.running) return 'Not running';
  return row.models.length === 1 ? '1 model' : `${row.models.length} models`;
}

export const LocalServersSection: React.FC<LocalServersSectionProps> = ({ selectedProvider, onSelect }) => {
  const { updateProvider } = useSettings();
  const { showToast } = useToast();
  const { rows, isScanning, enable, rescan, addUrl } = useLocalServers();
  const [urlDraft, setUrlDraft] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const handleRescan = () => {
    rescan().catch((error: unknown) => {
      console.error('[LocalServersSection] Rescan failed:', error);
      showToast('Could not rescan local servers', 'error');
    });
  };

  const handleAddUrl = async () => {
    if (urlDraft === null) return;
    setIsAdding(true);
    try {
      const result = await addUrl(urlDraft);
      if ('error' in result) {
        showToast(result.error, 'error');
        return;
      }
      setUrlDraft(null);
    } catch (error: unknown) {
      console.error('[LocalServersSection] Add URL failed:', error);
      showToast('Could not add that server', 'error');
    } finally {
      setIsAdding(false);
    }
  };

  const handleSelect = (row: LocalRow) => {
    if (row.saved) onSelect(row.id);
    else enable(row);
  };

  const handleToggle = (row: LocalRow, checked: boolean) => {
    if (row.saved) updateProvider(row.id, { active: checked });
    else if (checked) enable(row);
  };

  const actions = (
    <>
      <IconButton icon={RefreshCw} label="Rescan local servers" size="sm" spin={isScanning} onClick={handleRescan} />
      <IconButton icon={Plus} label="Add a local server by URL" size="sm" onClick={() => setUrlDraft(LOCAL_URL_DRAFT)} />
    </>
  );

  return (
    <ProviderGroup title="Local" accessory={actions}>
      {rows.map((row) => (
        <ProviderListItem
          key={row.id}
          provider={row.id}
          selected={selectedProvider === row.id}
          active={row.saved?.active ?? false}
          onSelect={() => handleSelect(row)}
          onToggle={(checked) => handleToggle(row, checked)}
          detail={rowDetail(row)}
          status={row.running ? 'running' : 'stopped'}
        />
      ))}

      {urlDraft !== null && (
        <form
          className="flex flex-wrap justify-end gap-2 pt-1"
          onSubmit={(e) => {
            e.preventDefault();
            void handleAddUrl();
          }}
        >
          <Input
            autoFocus
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setUrlDraft(null)}
            aria-label="Local server URL"
            className="basis-full"
          />
          <Button variant="ghost" size="sm" onClick={() => setUrlDraft(null)} disabled={isAdding}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="sm" disabled={isAdding || !urlDraft.trim()}>
            {isAdding ? 'Connecting…' : 'Add'}
          </Button>
        </form>
      )}

      {rows.length === 0 && urlDraft === null && (
        <Text as="p" variant="helper" tone="faint" className="px-2">{LOCAL_EMPTY_HINT}</Text>
      )}
    </ProviderGroup>
  );
};
