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
  Mic,
  Sparkles,
  Clock,
  Users,
  ExternalLink,
} from 'lucide-react';
import { useApp, AppStatus } from '@shared/contexts/AppContext';
import { useRecordingContext } from '@features/recording';
import { useHistory } from '@shared/contexts/HistoryContext';
import SummaryView from '@/components/SummaryView';
import TranscriptViewEnhanced from '@/components/TranscriptViewEnhanced';
import { TodoList, TodosProvider } from '@features/todos';
import { NotesView, NotesProvider } from '@features/notes';
import { useMeeting } from '@shared/contexts/MeetingContext';
import { ResultsAudioPlayer } from './ResultsAudioPlayer';
import { isTauriEnvironment } from '@/services/tauri';
import { dialogService, fileSystemService, notificationService } from '@/services/tauri';
import { NotificationType } from '@config/notifications.config';
import { useTranscribeRecording } from '@shared/hooks/useTranscribeRecording';
import { SURFACE, BORDER, TEXT, COMPONENT } from '@config/theme.config';
import type { HistoryItem } from '@/types';

const TABS = { SUMMARY: 'summary', TRANSCRIPT: 'transcript', TODO: 'todo', NOTES: 'notes' };

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
        <span className={`flex items-center gap-1 text-xs ${TEXT.muted}`}>
          <Clock className="w-3 h-3" />
          {formatDate(item.scheduledStart)}
          {' · '}
          {formatTime(item.scheduledStart)}
          {item.scheduledEnd && `–${formatTime(item.scheduledEnd)}`}
        </span>
      )}
      {hasParticipants && (
        <span
          className={`flex items-center gap-1 text-xs ${TEXT.muted}`}
          title={item.participants!.map(p => p.name || p.email || 'Unknown').join(', ')}
        >
          <Users className="w-3 h-3" />
          {item.participants!.length} participant{item.participants!.length !== 1 ? 's' : ''}
        </span>
      )}
      {hasMeetingUrl && (
        <button
          onClick={handleJoinMeeting}
          className={`flex items-center gap-1 text-xs ${TEXT.link} hover:underline`}
        >
          <ExternalLink className="w-3 h-3" />
          Join Meeting
        </button>
      )}
    </div>
  );
};

export const ResultsView: React.FC = () => {
  const { result, activeResultTab, setActiveResultTab, resetToIdle, setSelectedHistoryId, selectedHistoryId, meetingChatOpen, setMeetingChatOpen } = useApp();
  const meeting = useMeeting();
  const recording = useRecordingContext();
  const { items: historyItems } = useHistory();
  const { transcribe, isTranscribing } = useTranscribeRecording();

  // Look up recording file name from history item
  const currentHistoryItem = selectedHistoryId
    ? historyItems.find(item => item.id === selectedHistoryId)
    : null;
  const recordingFileName = currentHistoryItem?.recordingFileName;
  
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [isCopyMenuOpen, setIsCopyMenuOpen] = useState(false);
  const [isDownloadMenuOpen, setIsDownloadMenuOpen] = useState(false);
  const copyMenuRef = useRef<HTMLDivElement>(null);
  const downloadMenuRef = useRef<HTMLDivElement>(null);

  // Close menus when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (copyMenuRef.current && !copyMenuRef.current.contains(event.target as Node)) {
        setIsCopyMenuOpen(false);
      }
      if (downloadMenuRef.current && !downloadMenuRef.current.contains(event.target as Node)) {
        setIsDownloadMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!result) return null;

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState(result.title);

  const handleCopy = async (target: 'summary' | 'transcript') => {
    const text = target === 'summary' ? result.summary : result.transcript;
    try {
      await navigator.clipboard.writeText(text);
      setCopyFeedback(target);
      setTimeout(() => setCopyFeedback(null), 2000);
    } catch (err) {
      console.error('Failed to copy', err);
    }
    setIsCopyMenuOpen(false);
  };

  const downloadFile = async (filename: string, content: string, mimeType: string) => {
    if (isTauriEnvironment()) {
      try {
        const { join, downloadDir } = await import('@tauri-apps/api/path');
        const downloads = await downloadDir();
        const defaultPath = await join(downloads, filename);

        const savePath = await dialogService.save({
          title: 'Save File',
          defaultPath,
          filters: [
            {
              name: 'Text Files',
              extensions: filename.endsWith('.json') ? ['json'] : ['txt', 'md'],
            },
          ],
        });

        if (savePath) {
          await fileSystemService.writeTextFile(savePath, content);
          await notificationService.notify(NotificationType.FILE_SAVED, `Saved to ${savePath}`);
        }
      } catch (error) {
        console.error('Failed to save file:', error);
        await notificationService.notify(NotificationType.ERROR, 'Failed to save file');
      }
    } else {
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  const handleDownload = (format: 'txt' | 'md' | 'html' | 'json', scope: 'current' | 'all') => {
    if (!result) return;
    setIsDownloadMenuOpen(false);

    let content = '';
    let mime = 'text/plain';
    let ext = format;
    const filenameBase = result.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();

    if (format === 'json') {
      content = JSON.stringify(result, null, 2);
      mime = 'application/json';
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
        mime = 'text/html';
      } else {
        content = body;
      }
    }

    downloadFile(`${filenameBase}_${scope}.${ext}`, content, mime);
  };

  // Combine AI action items with up-to-date completion status
  const getActionItemsWithStatus = () => {
    return meeting.getActionItemsWithStatus();
  };

  const getUserTodos = () => {
    return meeting.userTodos.map((item) => ({
      ...item,
      completed: meeting.actionItemCompletions[item.id] ?? item.completed,
    }));
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

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Meeting Title Header - Compact */}
      <div className="px-12 pt-3 pb-3">
        {isEditingTitle ? (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={editedTitle}
              onChange={(e) => setEditedTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleTitleSave();
                if (e.key === 'Escape') handleTitleCancel();
              }}
              className={`flex-1 text-lg font-bold ${TEXT.primary} ${SURFACE.inputField} border ${BORDER.input} rounded-lg px-2.5 py-1.5 outline-none ${BORDER.inputFocus}`}
              autoFocus
            />
            <button
              onClick={handleTitleSave}
              className={`px-2.5 py-1.5 text-xs font-semibold ${COMPONENT.primaryButton} rounded-lg`}
            >
              Save
            </button>
            <button
              onClick={handleTitleCancel}
              className={`px-2.5 py-1.5 text-xs font-semibold ${COMPONENT.secondaryButton} rounded-lg`}
            >
              Cancel
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <h1 className={`text-lg font-bold ${TEXT.heading} truncate flex-1`}>
                {result.title}
              </h1>
              <button
                onClick={handleTitleEdit}
                className={`${COMPONENT.iconButtonSm} ${SURFACE.hoverSubtle} shrink-0`}
                title="Edit title"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              {currentHistoryItem?.recordingFileName && (
                <button
                  onClick={() => currentHistoryItem && transcribe(currentHistoryItem)}
                  disabled={isTranscribing}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold ${TEXT.secondary} hover:text-parchment-900 dark:hover:text-night-100 ${SURFACE.hoverSubtle} rounded-lg transition-all shrink-0 disabled:opacity-50 disabled:cursor-not-allowed`}
                  title={currentHistoryItem?.pendingTranscription ? 'Transcribe recording' : 'Re-transcribe recording'}
                >
                  {isTranscribing ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : currentHistoryItem?.pendingTranscription ? (
                    <Mic className="w-3.5 h-3.5" />
                  ) : (
                    <RefreshCw className="w-3.5 h-3.5" />
                  )}
                  {isTranscribing
                    ? 'Transcribing...'
                    : currentHistoryItem?.pendingTranscription
                      ? 'Transcribe'
                      : 'Re-transcribe'}
                </button>
              )}
            </div>
            {/* Calendar metadata — only shown when available */}
            {currentHistoryItem?.scheduledStart && (
              <CalendarMetaRow item={currentHistoryItem} />
            )}
            {/* Categories - below title */}
            {result.categories && result.categories.length > 0 && (
              <div className="flex gap-1.5 mt-2">
                {result.categories.map((c) => (
                  <span
                    key={c}
                    className={`px-2 py-0.5 ${SURFACE.chip} ${TEXT.secondary} text-[10px] font-medium rounded-full uppercase tracking-wide`}
                  >
                    {c}
                  </span>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Tabs Navigation */}
      <div className={`border-b ${BORDER.default}`}>
        <div className="flex items-center px-12 h-11">
          {/* Tab buttons */}
          <div className="flex gap-1 flex-1">
            <button
              onClick={() => setActiveResultTab('summary')}
              className={`px-3 py-2 text-sm font-semibold transition-all relative ${
                activeResultTab === TABS.SUMMARY
                  ? TEXT.primary
                  : `${TEXT.muted} hover:text-parchment-800 dark:hover:text-night-300`
              }`}
            >
              Summary
              {activeResultTab === TABS.SUMMARY && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-parchment-900 dark:bg-night-100" />
              )}
            </button>
            <button
              onClick={() => setActiveResultTab('transcript')}
              className={`px-3 py-2 text-sm font-semibold transition-all relative ${
                activeResultTab === TABS.TRANSCRIPT
                  ? TEXT.primary
                  : `${TEXT.muted} hover:text-parchment-800 dark:hover:text-night-300`
              }`}
            >
              Transcript
              {activeResultTab === TABS.TRANSCRIPT && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-parchment-900 dark:bg-night-100" />
              )}
            </button>
            <button
              onClick={() => setActiveResultTab('todo')}
              className={`px-3 py-2 text-sm font-semibold transition-all relative ${
                activeResultTab === TABS.TODO
                  ? TEXT.primary
                  : `${TEXT.muted} hover:text-parchment-800 dark:hover:text-night-300`
              }`}
            >
              To-Do
              {activeResultTab === TABS.TODO && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-parchment-900 dark:bg-night-100" />
              )}
            </button>
            <button
              onClick={() => setActiveResultTab('notes')}
              className={`px-3 py-2 text-sm font-semibold transition-all relative ${
                activeResultTab === TABS.NOTES
                  ? TEXT.primary
                  : `${TEXT.muted} hover:text-parchment-800 dark:hover:text-night-300`
              }`}
            >
              Notes
              {activeResultTab === TABS.NOTES && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-parchment-900 dark:bg-night-100" />
              )}
            </button>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 ml-auto">
            {/* Copy Button */}
            <div
              className={`relative flex items-center ${SURFACE.card} rounded-lg border ${BORDER.default} shrink-0`}
              ref={copyMenuRef}
            >
              <button
                onClick={() => handleCopy(activeResultTab as 'summary' | 'transcript')}
                className={`flex items-center justify-center p-1.5 ${COMPONENT.dropdownItemHover} rounded-l-lg transition-all`}
                title="Copy current tab"
              >
                {copyFeedback === activeResultTab ? (
                  <Check className="w-3.5 h-3.5 text-green-500" />
                ) : (
                  <Copy className={`w-3.5 h-3.5 ${TEXT.secondary}`} />
                )}
              </button>
              <div className={`w-px h-3.5 ${SURFACE.divider}`} />
              <button
                onClick={() => setIsCopyMenuOpen(!isCopyMenuOpen)}
                className={`p-1.5 ${COMPONENT.dropdownItemHover} rounded-r-lg transition-all`}
                title="Copy options"
              >
                <ChevronDown className={`w-3.5 h-3.5 ${TEXT.secondary}`} />
              </button>

              {isCopyMenuOpen && (
                <div className={`absolute top-full right-0 mt-2 w-48 ${SURFACE.dropdown} rounded-lg shadow-lg border ${BORDER.default} overflow-hidden z-20 animate-fade-in`}>
                  <button
                    onClick={() => handleCopy('summary')}
                    className={`w-full text-left px-3 py-2 text-sm ${COMPONENT.dropdownItemHover} flex items-center gap-2`}
                  >
                    {copyFeedback === 'summary' ? (
                      <Check className="w-4 h-4 text-green-500" />
                    ) : (
                      <FileText className="w-4 h-4" />
                    )}
                    Copy Summary
                  </button>
                  <button
                    onClick={() => handleCopy('transcript')}
                    className={`w-full text-left px-3 py-2 text-sm ${COMPONENT.dropdownItemHover} flex items-center gap-2`}
                  >
                    {copyFeedback === 'transcript' ? (
                      <Check className="w-4 h-4 text-green-500" />
                    ) : (
                      <MessageSquare className="w-4 h-4" />
                    )}
                    Copy Transcript
                  </button>
                </div>
              )}
            </div>

            {/* Download Button */}
            <div
              className={`relative flex items-center ${SURFACE.card} rounded-lg border ${BORDER.default} shrink-0`}
              ref={downloadMenuRef}
            >
              <button
                onClick={() => handleDownload('md', 'current')}
                className={`flex items-center justify-center p-1.5 ${COMPONENT.dropdownItemHover} rounded-l-lg transition-all`}
                title="Download as Markdown"
              >
                <Download className={`w-3.5 h-3.5 ${TEXT.secondary}`} />
              </button>
              <div className={`w-px h-3.5 ${SURFACE.divider}`} />
              <button
                onClick={() => setIsDownloadMenuOpen(!isDownloadMenuOpen)}
                className={`p-1.5 ${COMPONENT.dropdownItemHover} rounded-r-lg transition-all`}
                title="Download options"
              >
                <ChevronDown className={`w-3.5 h-3.5 ${TEXT.secondary}`} />
              </button>

              {isDownloadMenuOpen && (
                <div className={`absolute top-full right-0 mt-2 w-56 ${SURFACE.dropdown} rounded-lg shadow-lg border ${BORDER.default} overflow-hidden z-20 animate-fade-in`}>
                  <div className={`px-3 py-2 text-xs font-bold uppercase ${TEXT.faint}`}>
                    Current View
                  </div>
                  <button
                    onClick={() => handleDownload('txt', 'current')}
                    className={`w-full text-left px-3 py-2 text-sm ${COMPONENT.dropdownItemHover} flex items-center gap-2`}
                  >
                    <FileText className="w-4 h-4" /> As Text (.txt)
                  </button>
                  <button
                    onClick={() => handleDownload('md', 'current')}
                    className={`w-full text-left px-3 py-2 text-sm ${COMPONENT.dropdownItemHover} flex items-center gap-2`}
                  >
                    <FileCode className="w-4 h-4" /> As Markdown (.md)
                  </button>
                  <button
                    onClick={() => handleDownload('html', 'current')}
                    className={`w-full text-left px-3 py-2 text-sm ${COMPONENT.dropdownItemHover} flex items-center gap-2`}
                  >
                    <FileType className="w-4 h-4" /> As HTML (.html)
                  </button>

                  <div className={`my-1 border-t ${BORDER.default}`} />

                  <div className={`px-3 py-2 text-xs font-bold uppercase ${TEXT.faint}`}>
                    Full Session
                  </div>
                  <button
                    onClick={() => handleDownload('json', 'all')}
                    className={`w-full text-left px-3 py-2 text-sm ${COMPONENT.dropdownItemHover} flex items-center gap-2`}
                  >
                    <FileJson className="w-4 h-4" /> Export JSON
                  </button>
                  <button
                    onClick={() => handleDownload('md', 'all')}
                    className={`w-full text-left px-3 py-2 text-sm ${COMPONENT.dropdownItemHover} flex items-center gap-2`}
                  >
                    <FileCode className="w-4 h-4" /> Export All Markdown
                  </button>
                </div>
              )}
            </div>

            {/* AI Chat Button */}
            <button
              onClick={() => setMeetingChatOpen(!meetingChatOpen)}
              className={`flex items-center justify-center p-1.5 rounded-lg border transition-all ${
                meetingChatOpen
                  ? ''
                  : `${SURFACE.card} ${BORDER.default} ${COMPONENT.dropdownItemHover}`
              }`}
              style={meetingChatOpen ? {
                background: 'var(--ai-gradient)',
                borderColor: 'var(--ai-border)',
                boxShadow: 'var(--ai-glow)',
              } : undefined}
              title="AI Chat"
            >
              <Sparkles className="w-3.5 h-3.5" style={{ color: meetingChatOpen ? '#ffffff' : 'var(--ai-accent)' }} />
            </button>
          </div>
        </div>
      </div>

      {/* Audio Player - always visible above content when recording file exists */}
      {recordingFileName && (
        <ResultsAudioPlayer recordingFileName={recordingFileName} />
      )}

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto px-12 py-4 custom-scrollbar">
        {activeResultTab === TABS.SUMMARY && (
          <SummaryView
            summary={result.summary}
            structuredSummary={result.structuredSummary}
            timestamp={result.timestamp}
            title={result.title}
          />
        )}
        {activeResultTab === TABS.TRANSCRIPT && (
          <TranscriptViewEnhanced
            text={result.transcript || ''}
            timestamp={result.timestamp}
            title={result.title}
          />
        )}
        {activeResultTab === TABS.TODO && (
          <TodoList />
        )}
        {activeResultTab === TABS.NOTES && (
          <NotesProvider meetingId={meeting.selectedHistoryId || result.id || ''}>
            <NotesView />
          </NotesProvider>
        )}
      </div>
    </div>
  );
};

export default ResultsView;
