/** Appearance, capture input, storage, search index and version; data comes from systemInfoStore. */

import React, { useState, useCallback } from 'react';
import { Sun, Moon, Monitor, Copy, Check, FolderOpen, FolderSearch, RefreshCw, Loader2 } from 'lucide-react';
import { useTheme } from '@shared/hooks/useTheme';
import { useSettings } from '@shared/contexts/SettingsContext';
import { useToast } from '@shared/contexts/ToastContext';
import { useCopiedFlag } from '@shared/hooks';
import { isTauriEnvironment, revealInFinder } from '@services/tauri';
import { searchIndexingService } from '@services/searchIndexing.service';
import { useSystemInfo, systemInfoStore, DISK_USAGE_LABELS } from '@features/settings/stores/systemInfoStore';
import { SettingsPage } from './shared';
import { Button, Card, CardRow, Icon, IconButton, Section, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Status, Switch, Tabs, Text } from '@shared/ui';

import { useAppUpdate } from '@features/settings/hooks/useAppUpdate';
import { AcknowledgementsDialog } from './AcknowledgementsDialog';
import { useLiveDictation } from '@features/settings/hooks/useSpeechModels';
import { LIVE_TRANSCRIPTION_MARK } from './shared';
import { TRANSCRIPTION_CONFIG } from '@config/transcription.config';
import { AUDIO_CONFIG, type AudioCaptureSource } from '@config/audio.config';
import { LAYOUT } from '@config/layout.config';
import { confirm } from '@shared/stores/confirmStore';

/** Recording sources offered in General › Capture, and what each needs from macOS. */
const CAPTURE_SOURCES = ['systemAndMicrophone', 'system', 'microphone'] as const;
const CAPTURE_HINT: Record<(typeof CAPTURE_SOURCES)[number], string> = {
  systemAndMicrophone: 'Screen Recording and Microphone access required.',
  system: 'Screen Recording permission required.',
  microphone: 'Microphone access required.',
};

export const GeneralPanel: React.FC = () => {
  const { theme, setTheme } = useTheme();
  const { settings, setSettings } = useSettings();
  const liveDictation = useLiveDictation();
  const { liveCopy } = TRANSCRIPTION_CONFIG;
  const { showToast } = useToast();

  const appUpdate = useAppUpdate();
  const [acknowledgementsOpen, setAcknowledgementsOpen] = useState(false);

  // Data from store (survives unmounts)
  const {
    storagePath,
    storagePathError,
    diskUsage,
    appVersion,
    indexStats,
  } = useSystemInfo();

  const captureSource = (settings.defaultAudioSource || 'systemAndMicrophone') as (typeof CAPTURE_SOURCES)[number];
  const { copied: storagePathCopied, markCopied: markStoragePathCopied } = useCopiedFlag();
  const [upToDate, setUpToDate] = useState(false);
  const [rebuildingPhase, setRebuildingPhase] = useState<'meetings' | 'chats' | null>(null);
  const [isRebuilding, setIsRebuilding] = useState(false);


  const loadIndexStats = useCallback(async () => {
    await systemInfoStore.refresh();
  }, []);

  const handleReindexMeetings = useCallback(async () => {
    setRebuildingPhase('meetings');
    try {
      const { ragIndexer } = await import('@extensions/rag');
      const meetingItems = await searchIndexingService.loadMeetingsForIndexing();
      await ragIndexer.indexAll(meetingItems, { includeEmbeddings: true, force: true });
    } catch (error: unknown) {
      console.error('[GeneralPanel] Meeting re-index failed:', error);
      showToast('Couldn’t re-index meetings', 'error');
    } finally {
      setRebuildingPhase(null);
      loadIndexStats();
    }
  }, [showToast, loadIndexStats]);

  const handleReindexChats = useCallback(async () => {
    setRebuildingPhase('chats');
    try {
      const { chatIndexer } = await import('@extensions/rag');
      const chatSessions = await searchIndexingService.loadChatsForIndexing();
      await chatIndexer.indexAllSessions(chatSessions, { includeEmbeddings: true, force: true });
    } catch (error: unknown) {
      console.error('[GeneralPanel] Chat re-index failed:', error);
      showToast('Couldn’t re-index chats', 'error');
    } finally {
      setRebuildingPhase(null);
      loadIndexStats();
    }
  }, [showToast, loadIndexStats]);

  const handleRebuildIndex = useCallback(async () => {
    const confirmed = await confirm({
      title: 'Rebuild the search index?',
      description: 'Clears and re-indexes every meeting and chat. This can take a while.',
      confirmLabel: 'Rebuild',
      tone: 'danger',
    });
    if (!confirmed) return;
    setIsRebuilding(true);

    try {
      const { vectorDB, ragIndexer, chatIndexer, preloadModel } = await import('@extensions/rag');

      await vectorDB.rebuild();

      try { await preloadModel(); } catch { /* consent denied or download failed */ }

      const [meetingItems, chatSessions] = await Promise.all([
        searchIndexingService.loadMeetingsForIndexing(),
        searchIndexingService.loadChatsForIndexing(),
      ]);

      console.log(`[GeneralPanel] Rebuild: ${meetingItems.length} meetings, ${chatSessions.length} chats`);

      setRebuildingPhase('meetings');
      try {
        await ragIndexer.indexAll(meetingItems, {
          includeEmbeddings: true,
        });
      } catch (error: unknown) {
        console.error('[GeneralPanel] Meeting indexing failed:', error);
        showToast('Couldn’t re-index meetings; chats continue', 'error');
      }
      loadIndexStats();

      setRebuildingPhase('chats');
      try {
        await chatIndexer.indexAllSessions(chatSessions, {
          includeEmbeddings: true,
        });
      } catch (error: unknown) {
        console.error('[GeneralPanel] Chat indexing failed:', error);
        showToast('Couldn’t re-index chats', 'error');
      }
      loadIndexStats();
    } catch (error: unknown) {
      console.error('[GeneralPanel] Rebuild index failed:', error);
      showToast('Couldn’t rebuild the index', 'error');
    } finally {
      setRebuildingPhase(null);
      setIsRebuilding(false);
      loadIndexStats();
    }
  }, [showToast, loadIndexStats]);

  const handleOpenInFinder = async () => {
    if (!storagePath) return;
    try {
      await revealInFinder(storagePath);
    } catch (error) {
      console.error('[GeneralPanel] Failed to open in Finder:', error);
    }
  };

  const handleCopyStoragePath = async () => {
    if (!storagePath) return;
    try {
      await navigator.clipboard.writeText(storagePath);
      markStoragePathCopied();
    } catch (error) {
      console.error('[GeneralPanel] Failed to copy storage path:', error);
    }
  };

  const handleCheckForUpdate = async () => {
    setUpToDate(!(await appUpdate.checkForUpdate()));
  };

  const themeOptions = [
    { value: 'light', icon: Sun, label: 'Light' },
    { value: 'dark', icon: Moon, label: 'Dark' },
    { value: 'system', icon: Monitor, label: 'System' },
  ] as const;
  const themeTabs = themeOptions.map(({ value, icon, label }) => ({
    value,
    label: (
      <span className="flex items-center gap-1.5">
        <Icon icon={icon} size="xs" />
        {label}
      </span>
    ),
  }));

  const indexBusy = rebuildingPhase !== null || isRebuilding;

  return (
    <SettingsPage title="General" description="Appearance, capture, storage, and app information.">
      {/* Appearance — theme + import processing */}
      <Section title="Appearance">
        <CardRow title="Theme" actions={<Tabs items={themeTabs} value={theme} onValueChange={setTheme} />} />

        {/* Model icons — opt-in: loads org avatars from huggingface.co */}
        <CardRow
          title="Model Icons"
          description="Show Hugging Face org icons on local models. Loads images from huggingface.co."
          actions={
            <Switch
              size="sm"
              checked={!!settings.showModelAvatars}
              onCheckedChange={(checked) => setSettings({ showModelAvatars: checked })}
              aria-label="Show model icons"
            />
          }
        />

        <CardRow
          title="Tool Activity"
          description="Show each tool the assistant uses, inline in its answer."
          actions={
            <Switch
              size="sm"
              checked={!settings.hideToolCalls}
              onCheckedChange={(checked) => setSettings({ hideToolCalls: !checked })}
              aria-label="Show tool activity"
            />
          }
        />

        <CardRow
          title="Import Processing"
          description="How imported audio files are processed."
          actions={
            <>
              <div className={LAYOUT.settingsSelect}>
                <Select
                  value={settings.jobProcessing?.mode || 'sequential'}
                  onValueChange={(val) => setSettings({
                    jobProcessing: {
                      mode: val as 'sequential' | 'parallel',
                      maxConcurrent: settings.jobProcessing?.maxConcurrent ?? 2,
                    },
                  })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sequential">Sequential</SelectItem>
                    <SelectItem value="parallel">Parallel</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {settings.jobProcessing?.mode === 'parallel' && (
                <div className="w-28">
                  <Select
                    value={String(settings.jobProcessing?.maxConcurrent ?? 2)}
                    onValueChange={(val) => setSettings({
                      jobProcessing: {
                        mode: 'parallel',
                        maxConcurrent: Number(val),
                      },
                    })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 7 }, (_, i) => i + 2).map(n => (
                        <SelectItem key={n} value={String(n)}>
                          {n} concurrent
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </>
          }
        />
      </Section>

      <Section title="Capture">
        <CardRow
          title="Input Source"
          description={CAPTURE_HINT[captureSource]}
          actions={
            <div className={LAYOUT.settingsSelect}>
              <Select value={captureSource} onValueChange={(source) => setSettings({ defaultAudioSource: source as AudioCaptureSource })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CAPTURE_SOURCES.map((source) => (
                    <SelectItem key={source} value={source}>{AUDIO_CONFIG.captureSources[source].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          }
        />
        <CardRow
          title="Real-time Transcription"
          description={settings.liveTranscription && !liveDictation ? (
            <>
              {liveCopy.unavailable.before} <Icon icon={LIVE_TRANSCRIPTION_MARK.icon} size="xs" label={LIVE_TRANSCRIPTION_MARK.label} className="inline align-text-bottom" /> {liveCopy.unavailable.after}
            </>
          ) : liveCopy.description}
          actions={
            <Switch
              size="sm"
              checked={!!settings.liveTranscription}
              onCheckedChange={(checked) => setSettings({ liveTranscription: checked })}
              aria-label="Real-time transcription"
            />
          }
        />
        <CardRow
          title="Transcribe After Recording"
          description="Start the transcript and summary as soon as a recording stops. Off: it waits in the sidebar until you press Transcribe."
          actions={
            <Switch
              size="sm"
              checked={!!settings.autoTranscribe}
              onCheckedChange={(checked) => setSettings({ autoTranscribe: checked })}
              aria-label="Transcribe after recording"
            />
          }
        />
      </Section>

      {isTauriEnvironment() && (
        <Section title="Storage Location">
          <div className="flex items-center gap-2 py-3">
            <Icon icon={FolderOpen} size="sm" tone="faint" className="shrink-0" />
            <Text tone="muted" truncate className="flex-1">{storagePath ?? PENDING}</Text>
            <IconButton icon={FolderSearch} label="Open in Finder" size="sm" onClick={handleOpenInFinder} disabled={!storagePath} />
            <Button variant="ghost" size="iconSm" onClick={handleCopyStoragePath} aria-label="Copy path" disabled={!storagePath}>
              <Icon icon={storagePathCopied ? Check : Copy} size="sm" tone={storagePathCopied ? 'success' : 'faint'} />
            </Button>
          </div>
          {storagePathError && (
            <Text as="p" variant="helper" tone="danger" className="py-3">{storagePathError}</Text>
          )}
        </Section>
      )}

      {isTauriEnvironment() && (
        <Section title="Disk Usage">
          {DISK_USAGE_LABELS.map((label) => {
            const entry = diskUsage?.find((d) => d.label === label);
            return (
              <CardRow key={label} title={label} actions={<Text variant="mono" tone="muted">{entry ? formatBytes(entry.bytes) : PENDING}</Text>} />
            );
          })}
          <CardRow
            title="Total"
            actions={<Text variant="mono" className="font-medium">{diskUsage ? formatBytes(diskUsage.reduce((sum, d) => sum + d.bytes, 0)) : PENDING}</Text>}
          />
        </Section>
      )}

      {isTauriEnvironment() && (
        <Section title="Search Index">
          <IndexActionRow
                label="Meetings"
                indexed={indexStats?.meetings.indexed}
                total={indexStats?.meetings.onDisk}
                detail={indexStats ? `${indexStats.chunks.transcript} transcript chunks` : PENDING}
                onReindex={handleReindexMeetings}
                busy={rebuildingPhase === 'meetings'}
                disabled={indexBusy}
              />
              <IndexActionRow
                label="Chats"
                indexed={indexStats?.chats.indexed}
                total={indexStats?.chats.onDisk}
                detail={indexStats ? `${indexStats.chunks.total - indexStats.chunks.transcript} chat chunks` : PENDING}
                onReindex={handleReindexChats}
                busy={rebuildingPhase === 'chats'}
                disabled={indexBusy}
              />

          <CardRow
            title="Rebuild All"
            description="Wipes and re-indexes all meetings and chats."
            actions={
              <Button variant="outline" size="sm" onClick={() => void handleRebuildIndex()} disabled={indexBusy && !isRebuilding} loading={isRebuilding}>
                {!isRebuilding && <Icon icon={RefreshCw} size="xs" />}
                {isRebuilding ? 'Rebuilding…' : 'Rebuild All'}
              </Button>
            }
          />
        </Section>
      )}

      {/* App Info & Updates */}
      <Card>
        <CardRow title="Version" actions={<VersionStatus appVersion={appVersion} appUpdate={appUpdate} upToDate={upToDate} onCheck={handleCheckForUpdate} />} />
        <CardRow
          title="Acknowledgements"
          description="Open-source software used in Kasset."
          actions={<Button variant="outline" size="sm" onClick={() => setAcknowledgementsOpen(true)}>View</Button>}
        />
      </Card>
      <AcknowledgementsDialog open={acknowledgementsOpen} onOpenChange={setAcknowledgementsOpen} />
    </SettingsPage>
  );
};

/** Shown in a value slot until its data loads, so rows keep their place. */
const PENDING = '—';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
}

/** Index row: status badge, counts, and a re-index button */
const IndexActionRow: React.FC<{
  label: string;
  /** Undefined until stats load. */
  indexed?: number;
  total?: number;
  detail?: string;
  onReindex: () => void;
  busy: boolean;
  disabled: boolean;
}> = ({ label, indexed, total, detail, onReindex, busy, disabled }) => (
    <CardRow
      title={label}
      description={total != null && indexed !== undefined ? `${indexed} of ${total} indexed · ${detail}` : detail}
      status={indexed === undefined ? <Status>{PENDING}</Status> : <IndexStatus indexed={indexed} total={total} />}
      actions={
        <Button variant="outline" size="sm" onClick={onReindex} disabled={disabled && !busy} loading={busy}>
          {!busy && <Icon icon={RefreshCw} size="xs" />}
          {busy ? 'Indexing…' : 'Re-index'}
        </Button>
      }
    />
);

/** Synced / Stale against a total; Active / Empty without one. Counts live in the description. */
const IndexStatus: React.FC<{ indexed: number; total?: number }> = ({ indexed, total }) => {
  if (total == null) {
    return indexed > 0 ? <Status tone="success">Active</Status> : <Status>Empty</Status>;
  }
  return indexed >= total ? <Status tone="success">Synced</Status> : <Status tone="warning">Stale</Status>;
};

/** Version number plus the update-check state. */
const VersionStatus: React.FC<{
  appVersion: string;
  appUpdate: ReturnType<typeof useAppUpdate>;
  /** The last check found nothing newer. */
  upToDate: boolean;
  onCheck: () => void;
}> = ({ appVersion, appUpdate, upToDate, onCheck }) => (
  <>
    <Text variant="mono" tone="muted">{appVersion || '…'}</Text>
    {appUpdate.status === 'checking' && (
      <Text variant="helper" tone="muted" className="flex items-center gap-1.5">
        <Icon icon={Loader2} size="xs" className="animate-spin" />
        Checking…
      </Text>
    )}
    {appUpdate.status === 'idle' && !appUpdate.updateInfo && upToDate && (
      <Text variant="helper" tone="muted">Up to date</Text>
    )}
    {appUpdate.status === 'idle' && !appUpdate.updateInfo && (
      <Button variant="outline" size="sm" onClick={onCheck}>Check for Updates</Button>
    )}
    {appUpdate.status === 'available' && appUpdate.updateInfo && (
      <Text variant="helper" tone="success">v{appUpdate.updateInfo.version} available</Text>
    )}
    {appUpdate.status === 'error' && (
      <Text variant="helper" tone="danger">{appUpdate.error ?? 'Check failed'}</Text>
    )}
  </>
);

export default GeneralPanel;
