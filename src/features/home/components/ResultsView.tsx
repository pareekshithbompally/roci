/**
 * ResultsView Component
 * 
 * Display processed results with tabs for summary, transcript, todos, and notes.
 * Redesigned with native app look - no iframe wrapper, integrated with app header.
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  Copy,
  Check,
  Download,
  ChevronDown,
  FileText,
  MessageSquare,
  FileCode,
  FileType,
  FileJson,
  Pencil,
  RefreshCw,
  Sparkles,
  Clock,
  Users,
  ExternalLink,
} from 'lucide-react';
import { useAppResult, useActiveResultTab, useSelectedHistoryId, useMeetingChatOpen, useAppActions } from '@shared/stores/appStore';
import type { ResultTab } from '@shared/stores/appStore';
import { useHistoryData } from '@shared/contexts/HistoryContext';
import { SummaryView } from '@features/summary';
import { ParsedTranscript } from '@features/transcription';
import { LAYOUT } from '@config/layout.config';
import { TodoList } from '@features/todos';
import { NotesView } from '@features/notes';
import { ResultsAudioPlayer } from './ResultsAudioPlayer';
import { isTauriEnvironment, saveTextFile } from '@services/tauri';
import { useToast } from '@shared/contexts/ToastContext';
import { useTranscribeRecording } from '@shared/hooks/useTranscribeRecording';
import { useMeetingPhase } from '@shared/stores/meetingJobsStore';
import { MeetingStatus } from '@shared/components';
import { meetingPhaseAction } from '@config/meetingPhase.config';
import { MeetingPhaseNotice } from './MeetingPhaseNotice';
import type { HistoryItem } from '@shared/types';
import {
  Badge,
  Button,
  ButtonGroup,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Icon,
  IconButton,
  Input,
  Surface,
  Tabs,
  Text,
} from '@shared/ui';
import type { TabItem } from '@shared/ui';

const TAB_ITEMS: readonly TabItem<ResultTab>[] = [
  { value: 'summary', label: 'Summary' },
  { value: 'transcript', label: 'Transcript' },
  { value: 'todo', label: 'To-Do' },
  { value: 'notes', label: 'Notes' },
];

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return 'Today';
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

const CalendarMetaRow: React.FC<{ item: HistoryItem }> = ({ item }) => {
  const hasParticipants = item.participants && item.participants.length > 0;
  const hasMeetingUrl = !!item.meetingUrl;

  const handleJoinMeeting = async () => {
    if (!item.meetingUrl) return;
    if (isTauriEnvironment()) {
      const { open } = await import('@tauri-apps/plugin-shell');
      await open(item.meetingUrl);
    } else {
      window.open(item.meetingUrl, '_blank');
    }
  };

  return (
    <div className="flex items-center gap-3 mt-1.5 flex-wrap">
      {item.scheduledStart && (
        <Text variant="helper" tone="muted" className="flex items-center gap-1">
          <Icon icon={Clock} size="xs" />
          {formatDate(item.scheduledStart)}
          {' · '}
          {formatTime(item.scheduledStart)}
          {item.scheduledEnd && `–${formatTime(item.scheduledEnd)}`}
        </Text>
      )}
      {hasParticipants && (
        <Text
          variant="helper"
          tone="muted"
          className="flex items-center gap-1"
          title={item.participants!.map(p => p.name || p.email || 'Unknown').join(', ')}
        >
          <Icon icon={Users} size="xs" />
          {item.participants!.length} participant{item.participants!.length !== 1 ? 's' : ''}
        </Text>
      )}
      {hasMeetingUrl && (
        <Button variant="link" size="inline" onClick={handleJoinMeeting}>
          <Icon icon={ExternalLink} size="xs" />
          Join Meeting
        </Button>
      )}
    </div>
  );
};

type ExportFormat = 'txt' | 'md' | 'html' | 'json';

/** Save-panel filter label per export format. */
const EXPORT_KIND: Record<ExportFormat, string> = { txt: 'Plain Text', md: 'Markdown', html: 'HTML', json: 'JSON' };

export const ResultsView: React.FC = () => {
  const { showToast } = useToast();
  const result = useAppResult();
  const activeResultTab = useActiveResultTab();
  const selectedHistoryId = useSelectedHistoryId();
  const meetingChatOpen = useMeetingChatOpen();
  const { setActiveResultTab, setMeetingChatOpen } = useAppActions();
  const { items: historyItems } = useHistoryData();
  const { transcribe } = useTranscribeRecording();

  // Look up recording file name from history item
  const currentHistoryItem = selectedHistoryId
    ? historyItems.find(item => item.id === selectedHistoryId)
    : null;
  const recordingFileName = currentHistoryItem?.recordingFileName;
  const phase = useMeetingPhase(currentHistoryItem?.id, currentHistoryItem);
  const handleTranscribe = () => {
    if (currentHistoryItem) void transcribe(currentHistoryItem);
  };
  
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [isCopyMenuOpen, setIsCopyMenuOpen] = useState(false);
  const [isDownloadMenuOpen, setIsDownloadMenuOpen] = useState(false);

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');

  // Copy-feedback timer cleared on unmount (no setState after unmount).
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  // Sync the editable title when a new result loads.
  useEffect(() => {
    if (result) setEditedTitle(result.title);
  }, [result]);

  if (!result) return null;

  const handleCopy = async (target: 'summary' | 'transcript') => {
    const text = target === 'summary' ? result.summary : result.transcript;
    try {
      await navigator.clipboard.writeText(text);
      setCopyFeedback(target);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopyFeedback(null), 2000);
    } catch (err) {
      console.error('Failed to copy', err);
    }
    setIsCopyMenuOpen(false);
  };

  const downloadFile = async (filename: string, content: string, extension: ExportFormat) => {
    try {
      const path = await saveTextFile({ filename, content, kind: EXPORT_KIND[extension], extension });
      if (path) showToast(`Saved to ${path}`, 'success');
    } catch (error: unknown) {
      console.error('[ResultsView] Save failed:', error);
      showToast('Failed to save file', 'error');
    }
  };

  const handleDownload = (format: ExportFormat, scope: 'current' | 'all') => {
    if (!result) return;
    setIsDownloadMenuOpen(false);

    let content = '';
    const filenameBase = result.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();

    if (format === 'json') {
      content = JSON.stringify(result, null, 2);
    } else {
      const getPart = (key: 'summary' | 'transcript') =>
        key === 'summary' ? result.summary : result.transcript;

      let body = '';
      if (scope === 'all') {
        const sum = getPart('summary');
        const trans = getPart('transcript');
        if (format === 'html') {
          body = `<h1>${result.title}</h1><section><h2>Summary</h2><pre>${sum}</pre></section><section><h2>Transcript</h2><pre>${trans}</pre></section>`;
        } else {
          body = `# ${result.title}\n\n## Summary\n${sum}\n\n## Transcript\n${trans}`;
        }
      } else {
        const text = getPart(activeResultTab as 'summary' | 'transcript');
        if (format === 'html') {
          body = `<h1>${result.title} - ${activeResultTab}</h1><pre>${text}</pre>`;
        } else {
          body = text;
        }
      }

      if (format === 'html') {
        content = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${result.title}</title></head><body style="font-family: sans-serif; max-width: 800px; margin: 2rem auto; line-height: 1.6;">${body}</body></html>`;
      } else {
        content = body;
      }
    }

    void downloadFile(`${filenameBase}_${scope}.${format}`, content, format);
  };

  const handleTitleEdit = () => {
    setIsEditingTitle(true);
  };

  const handleTitleSave = async () => {
    if (editedTitle.trim() && editedTitle !== result.title) {
      // TODO: Add logic to update title in history
      console.log('[ResultsView] Updating title to:', editedTitle);
    }
    setIsEditingTitle(false);
  };

  const handleTitleCancel = () => {
    setEditedTitle(result.title);
    setIsEditingTitle(false);
  };

  const copyIcon = (target: string, idle: typeof Copy) =>
    copyFeedback === target ? <Icon icon={Check} size="sm" tone="success" /> : <Icon icon={idle} size="sm" />;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Meeting title — same page column as Settings */}
      <div className={`${LAYOUT.pageGutter} pt-3 pb-3`}>
      <div className={LAYOUT.pageColumn}>
        {isEditingTitle ? (
          <div className="flex items-center gap-2">
            <Input
              type="text"
              value={editedTitle}
              onChange={(e) => setEditedTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleTitleSave();
                if (e.key === 'Escape') handleTitleCancel();
              }}
              className="flex-1"
              autoFocus
            />
            <Button variant="primary" size="sm" onClick={handleTitleSave}>
              Save
            </Button>
            <Button variant="secondary" size="sm" onClick={handleTitleCancel}>
              Cancel
            </Button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <Text as="h1" variant="pageTitle" truncate className="flex-1">
                {result.title}
              </Text>
              <IconButton icon={Pencil} size="sm" label="Edit title" className="shrink-0" onClick={handleTitleEdit} />
              <MeetingStatus phase={phase} display="badge" />
              {currentHistoryItem?.recordingFileName && phase.kind === 'ready' && (
                <Button variant="ghost" size="sm" onClick={handleTranscribe} className="shrink-0">
                  <Icon icon={RefreshCw} size="xs" />
                  {meetingPhaseAction(phase)}
                </Button>
              )}
            </div>
            <div className="mt-3 empty:hidden">
              <MeetingPhaseNotice
                phase={phase}
                onAction={currentHistoryItem?.recordingFileName ? handleTranscribe : undefined}
              />
            </div>
            {/* Calendar metadata — only shown when available */}
            {currentHistoryItem?.scheduledStart && (
              <CalendarMetaRow item={currentHistoryItem} />
            )}
            {/* Categories - below title */}
            {result.categories && result.categories.length > 0 && (
              <div className="flex gap-1.5 mt-2">
                {result.categories.map((c) => (
                  <Badge key={c} dot={false}>
                    {c}
                  </Badge>
                ))}
              </div>
            )}
          </>
        )}
      </div>
      </div>

      {/* Tabs Navigation */}
      <Surface edge="bottom" className={LAYOUT.pageGutter}>
      <div className={`${LAYOUT.pageColumn} flex items-center gap-2 h-11`}>
        <Tabs items={TAB_ITEMS} value={activeResultTab} onValueChange={setActiveResultTab} />

        {/* Action Buttons */}
        <div className="flex items-center gap-2 ml-auto">
          {/* Copy Button */}
          <ButtonGroup>
            <Button
              variant="ghost"
              size="iconSm"
              onClick={() => handleCopy(activeResultTab as 'summary' | 'transcript')}
              title="Copy current tab"
            >
              {copyIcon(activeResultTab, Copy)}
            </Button>
            <DropdownMenu open={isCopyMenuOpen} onOpenChange={setIsCopyMenuOpen}>
              <DropdownMenuTrigger asChild>
                <IconButton icon={ChevronDown} size="sm" label="Copy options" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onSelect={() => handleCopy('summary')}>
                  {copyIcon('summary', FileText)}
                  Copy Summary
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => handleCopy('transcript')}>
                  {copyIcon('transcript', MessageSquare)}
                  Copy Transcript
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </ButtonGroup>

          {/* Download Button */}
          <ButtonGroup>
            <IconButton icon={Download} size="sm" label="Download as Markdown" onClick={() => handleDownload('md', 'current')} />
            <DropdownMenu open={isDownloadMenuOpen} onOpenChange={setIsDownloadMenuOpen}>
              <DropdownMenuTrigger asChild>
                <IconButton icon={ChevronDown} size="sm" label="Download options" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Current View</DropdownMenuLabel>
                <DropdownMenuItem onSelect={() => handleDownload('txt', 'current')}>
                  <Icon icon={FileText} size="sm" /> As Text (.txt)
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => handleDownload('md', 'current')}>
                  <Icon icon={FileCode} size="sm" /> As Markdown (.md)
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => handleDownload('html', 'current')}>
                  <Icon icon={FileType} size="sm" /> As HTML (.html)
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Full Session</DropdownMenuLabel>
                <DropdownMenuItem onSelect={() => handleDownload('json', 'all')}>
                  <Icon icon={FileJson} size="sm" /> Export JSON
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => handleDownload('md', 'all')}>
                  <Icon icon={FileCode} size="sm" /> Export All Markdown
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </ButtonGroup>

          {/* AI Chat Button */}
          <Button
            variant={meetingChatOpen ? 'ai' : 'outline'}
            size="iconSm"
            onClick={() => setMeetingChatOpen(!meetingChatOpen)}
            title="AI Chat"
          >
            <Icon icon={Sparkles} size="xs" tone={meetingChatOpen ? 'inherit' : 'ai'} />
          </Button>
        </div>
      </div>
      </Surface>

      {/* Audio Player - always visible above content when recording file exists */}
      {recordingFileName && (
        <ResultsAudioPlayer
          recordingFileName={recordingFileName}
          meetingId={currentHistoryItem?.id || ''}
          title={currentHistoryItem?.title || ''}
        />
      )}

      {/* Tab Content */}
      <div className={`flex-1 overflow-y-auto custom-scrollbar ${LAYOUT.pageGutter} py-4`}>
      <div className={`${LAYOUT.pageColumn} min-h-full flex flex-col`}>
        {activeResultTab === 'summary' && (
          <SummaryView
            summary={result.summary}
            structuredSummary={result.structuredSummary}
            timestamp={result.timestamp}
            title={result.title}
          />
        )}
        {activeResultTab === 'transcript' && (
          <ParsedTranscript text={result.transcript} segments={result.segments} />
        )}
        {activeResultTab === 'todo' && (
          <TodoList />
        )}
        {activeResultTab === 'notes' && (
          <NotesView />
        )}
      </div>
      </div>
    </div>
  );
};

export default ResultsView;
