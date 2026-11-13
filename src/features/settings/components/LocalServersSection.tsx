/**
 * LocalServersSection
 *
 * The "Local" group of the Providers sidebar: servers running on this Mac
 * (detected on their standard ports) and the ones the user saved. Switching a
 * detected server on saves it as a provider; Rescan refreshes model lists;
 * "Add URL" connects a server on any other address.
 */

import React, { useState } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { useSettings } from '@shared/contexts/SettingsContext';
import { useToast } from '@shared/contexts/ToastContext';
import { LOCAL_EMPTY_HINT } from '@config/localServers.config';
import { TYPOGRAPHY_CLASSES } from '@config/typography.config';
import { TEXT, COMPONENT } from '@config/theme.config';
import { useLocalServers } from '@features/settings/hooks/useLocalServers';
import { ProviderListItem } from './ProviderListItem';
import { SettingsSection, SettingsInput } from './shared';
import type { LocalRow } from '@services/providers/localServers';
import { Button } from '@shared/ui';

interface LocalServersSectionProps {
  selectedProvider: string | null;
  onSelect: (provider: string) => void;
}

function rowDetail(row: LocalRow): string {
  if (!row.running) return 'Not running';
  return row.modelIds.length === 1 ? '1 model' : `${row.modelIds.length} models`;
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
    <div className="flex items-center gap-0.5">
      <Button variant="ghost" size="iconSm" onClick={handleRescan} title="Rescan" aria-label="Rescan local servers">
        <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
      </Button>
      <Button variant="ghost" size="iconSm" onClick={() => setUrlDraft('')} title="Add URL" aria-label="Add a local server by URL">
        <Plus className="w-3.5 h-3.5" />
      </Button>
    </div>
  );

  return (
    <SettingsSection title="Local" action={actions}>
      <div className="space-y-1">
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
      </div>

      {urlDraft !== null && (
        <div className="space-y-2">
          <SettingsInput
            autoFocus
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleAddUrl();
              if (e.key === 'Escape') setUrlDraft(null);
            }}
            placeholder="http://localhost:9000"
          />
          <div className="flex items-center gap-2">
            <Button variant="primary" size="sm" onClick={() => void handleAddUrl()} disabled={isAdding || !urlDraft.trim()}>
              {isAdding ? 'Connecting…' : 'Add'}
            </Button>
            <button onClick={() => setUrlDraft(null)} className={COMPONENT.settingsMutedLink}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {rows.length === 0 && urlDraft === null && (
        <p className={`${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.faint}`}>{LOCAL_EMPTY_HINT}</p>
      )}
    </SettingsSection>
  );
};
