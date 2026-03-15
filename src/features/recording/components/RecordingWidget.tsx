/**
 * RecordingWidget Component — Unified Recording Tray
 *
 * Single fixed-position tray that holds all recording sessions as inline rows.
 * Replaces the old N-card vertical stack.
 *
 * Components (all in this file):
 * - RecordingWidget: tray container, header, minimize/expand
 * - RecordingTrayHeader: session count + minimize toggle (2+ sessions)
 * - MinimizedTrayPill: collapsed single pill for entire tray
 * - MinimizeButton: shared minimize button
 * - SessionRow: router → ActiveSessionRow or CompactSessionRow
 * - ActiveSessionRow: recording/paused — full controls
 * - CompactSessionRow: review/processing — compact with expand
 */

import React, { useState } from 'react';
import {
  Pause, Play, Square, Clock, Loader2, Sparkles,
  Trash2, Minimize2, X, Timer, Mic, ChevronRight,
  ChevronUp, ChevronDown,
} from 'lucide-react';
import { useRecordingSessions } from '../context/RecordingContext';
import { useSettings } from '@shared/contexts/SettingsContext';
import { resolveModel } from '@shared/utils/modelResolver';
import { AUDIO_CONFIG } from '@config/audio.config';
import { UI_CONFIG } from '@config/ui.config';
import { SURFACE, BORDER, TEXT, COMPONENT } from '@config/theme.config';
import { InfoCallout } from '@features/settings/components/shared';
import CustomAudioPlayer from '@/components/CustomAudioPlayer';
import type { RecordingSession } from '../types';

// Format time as MM:SS
const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

// === MinimizeButton (shared) ===

const MinimizeButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <button
    onClick={onClick}
    className={`p-1.5 ${SURFACE.hoverSubtle} transition-colors`}
    style={{ borderRadius: UI_CONFIG.radius.lg }}
    aria-label="Minimize recordings"
  >
    <Minimize2 className={`w-4 h-4 ${TEXT.muted}`} />
  </button>
);

// === RecordingTrayHeader ===

interface RecordingTrayHeaderProps {
  sessionCount: number;
  hasActiveCapture: boolean;
  onMinimize: () => void;
}

const RecordingTrayHeader: React.FC<RecordingTrayHeaderProps> = ({
  sessionCount,
  hasActiveCapture,
  onMinimize,
}) => (
  <div className={`flex items-center justify-between px-4 py-3 border-b ${BORDER.default}`}>
    <div className="flex items-center gap-2">
      {hasActiveCapture && (
        <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
      )}
      <span className={`text-sm font-semibold ${TEXT.secondary}`}>
        {hasActiveCapture ? 'Recording' : 'Sessions'} ({sessionCount})
      </span>
    </div>
    <MinimizeButton onClick={onMinimize} />
  </div>
);

// === MinimizedTrayPill ===

interface MinimizedTrayPillProps {
  sessions: RecordingSession[];
  activeSession: RecordingSession | null;
  onExpand: () => void;
}

const MinimizedTrayPill: React.FC<MinimizedTrayPillProps> = ({
  sessions,
  activeSession,
  onExpand,
}) => {
  let icon: React.ReactNode;
  let label: string;

  if (activeSession) {
    const isRecording = activeSession.status === 'recording';
    icon = (
      <div className={`w-2 h-2 rounded-full ${
        activeSession.isPaused ? 'bg-amber-500' : 'bg-red-500 animate-pulse'
      }`} />
    );
    label = `${isRecording ? 'REC' : 'Paused'} ${formatTime(activeSession.elapsedTime)}`;
  } else {
    const processingCount = sessions.filter(s => s.status === 'processing').length;
    if (processingCount > 0) {
      icon = <Loader2 className="w-3 h-3 animate-spin text-purple-500" />;
      label = processingCount === 1 ? 'Processing' : `${processingCount} processing`;
    } else {
      icon = <Mic className={`w-3 h-3 ${TEXT.muted}`} />;
      label = `${sessions.length} session${sessions.length > 1 ? 's' : ''}`;
    }
  }

  // Append count if multiple sessions and there's an active one
  if (sessions.length > 1 && activeSession) {
    label += ` +${sessions.length - 1}`;
  }

  return (
    <button
      onClick={onExpand}
      className={`flex items-center gap-2 px-4 py-2.5 bg-parchment-50 dark:bg-night-800 border ${BORDER.strong} shadow-2xl transition-all hover:scale-105 cursor-pointer`}
      style={{ borderRadius: UI_CONFIG.radius.xl }}
      aria-label={`${sessions.length} active recording${sessions.length > 1 ? 's' : ''}, click to expand`}
    >
      {icon}
      <span className={`text-xs font-semibold ${TEXT.secondary}`}>{label}</span>
      <ChevronRight className={`w-3 h-3 ${TEXT.faint}`} />
    </button>
  );
};

// === ActiveSessionRow — Recording/Paused ===

interface ActiveSessionRowProps {
  session: RecordingSession;
  showMinimize: boolean;
  onMinimize?: () => void;
}

const ActiveSessionRow: React.FC<ActiveSessionRowProps> = ({ session, showMinimize, onMinimize }) => {
  const recording = useRecordingSessions();

  const sourceLabel = AUDIO_CONFIG.captureSources[
    session.audioSource as keyof typeof AUDIO_CONFIG.captureSources
  ]?.label || session.audioSource;

  return (
    <div className="p-4 space-y-3">
      {/* Status line */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className={`w-2.5 h-2.5 rounded-full ${
              session.isPaused ? 'bg-amber-500' : 'bg-red-500 animate-pulse'
            }`}
          />
          <span className={`text-sm font-semibold ${TEXT.secondary}`}>
            {session.isPaused ? 'Paused' : 'Recording'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs ${TEXT.faint}`}>{sourceLabel}</span>
          {showMinimize && onMinimize && (
            <MinimizeButton onClick={onMinimize} />
          )}
        </div>
      </div>

      {/* Timer */}
      <div className="flex items-center gap-2">
        <Clock className={`w-4 h-4 ${TEXT.faint}`} />
        <span className={`text-2xl font-mono font-bold ${TEXT.primary}`}>
          {formatTime(session.elapsedTime)}
        </span>
      </div>

      {/* Stall warning */}
      {session.stalled && (
        <InfoCallout variant="warning">
          Audio capture may have stopped. Try force-stopping to save what was recorded.
        </InfoCallout>
      )}

      {/* Controls */}
      <div className="flex items-center gap-2">
        {session.stalled ? (
          <button
            onClick={() => recording.stopRecording(session.sessionId)}
            className="flex-1 px-4 py-3 bg-amber-600 hover:bg-amber-700 text-white font-medium text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20"
            style={{ borderRadius: UI_CONFIG.radius.xl }}
          >
            <Square className="w-4 h-4 fill-current" />
            Force Stop
          </button>
        ) : (
          <>
            {session.isPaused ? (
              <button
                onClick={() => recording.resumeRecording(session.sessionId)}
                className="flex-1 px-4 py-3 bg-green-600 hover:bg-green-700 text-white font-medium text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-green-500/20"
                style={{ borderRadius: UI_CONFIG.radius.xl }}
              >
                <Play className="w-4 h-4 fill-current" />
                Resume
              </button>
            ) : (
              <button
                onClick={() => recording.pauseRecording(session.sessionId)}
                className="flex-1 px-4 py-3 bg-amber-600 hover:bg-amber-700 text-white font-medium text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20"
                style={{ borderRadius: UI_CONFIG.radius.xl }}
              >
                <Pause className="w-4 h-4" />
                Pause
              </button>
            )}
            <button
              onClick={() => recording.stopRecording(session.sessionId)}
              className="px-4 py-3 bg-red-600 hover:bg-red-700 text-white font-medium text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-red-500/20"
              style={{ borderRadius: UI_CONFIG.radius.xl }}
            >
              <Square className="w-4 h-4 fill-current" />
              Stop
            </button>
          </>
        )}
      </div>

      {/* Error */}
      {session.error && (
        <InfoCallout variant="error">{session.error}</InfoCallout>
      )}
    </div>
  );
};

// === CompactSessionRow — Review & Processing ===

interface CompactSessionRowProps {
  session: RecordingSession;
  showMinimize: boolean;
  onMinimize?: () => void;
}

const CompactSessionRow: React.FC<CompactSessionRowProps> = ({ session, showMinimize, onMinimize }) => {
  const recording = useRecordingSessions();
  const { settings, providers } = useSettings();
  const hasModel = !!resolveModel(settings.chatModel, providers);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const isReview = session.status === 'review';
  const sourceLabel = AUDIO_CONFIG.captureSources[
    session.audioSource as keyof typeof AUDIO_CONFIG.captureSources
  ]?.label || session.audioSource;

  const handleGenerateSummary = async () => {
    setIsProcessing(true);
    try {
      await recording.processRecording(session.sessionId);
    } catch (error: any) {
      if (error.message !== 'Processing aborted by user') {
        console.error('[CompactSessionRow] Processing failed:', error);
      }
      setIsProcessing(false);
    }
  };

  return (
    <div className="px-4 py-3">
      {/* Compact header — always visible */}
      <div className="flex items-center gap-2">
        {/* Status icon */}
        {isProcessing || session.status === 'processing' ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-500 shrink-0" />
        ) : (
          <Mic className={`w-3.5 h-3.5 ${TEXT.muted} shrink-0`} />
        )}

        {/* Status label */}
        <span className={`text-sm font-medium ${TEXT.secondary}`}>
          {isProcessing || session.status === 'processing' ? 'Processing' : 'Review'}
        </span>

        {/* Duration */}
        <span className={`text-xs font-mono ${TEXT.faint} ml-auto`}>
          {formatTime(session.elapsedTime)}
        </span>

        {/* Expand/collapse toggle (review only, not processing) */}
        {isReview && !isProcessing && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className={`p-1 ${SURFACE.hoverSubtle} transition-colors`}
            style={{ borderRadius: UI_CONFIG.radius.md }}
            aria-label={isExpanded ? 'Collapse' : 'Expand'}
            aria-expanded={isExpanded}
          >
            {isExpanded ? (
              <ChevronUp className={`w-3.5 h-3.5 ${TEXT.faint}`} />
            ) : (
              <ChevronDown className={`w-3.5 h-3.5 ${TEXT.faint}`} />
            )}
          </button>
        )}

        {/* Abort button (processing) */}
        {(isProcessing || session.status === 'processing') && (
          <button
            onClick={() => {
              recording.abortProcessing(session.sessionId);
              setIsProcessing(false);
            }}
            className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
            style={{ borderRadius: UI_CONFIG.radius.md }}
            aria-label="Cancel processing"
          >
            <X className={`w-3.5 h-3.5 ${TEXT.faint} hover:text-red-500`} />
          </button>
        )}

        {/* Discard button (not during processing) */}
        {!isProcessing && session.status !== 'processing' && (
          <button
            onClick={() => recording.discardRecording(session.sessionId)}
            className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
            style={{ borderRadius: UI_CONFIG.radius.md }}
            aria-label="Discard"
          >
            <Trash2 className={`w-3.5 h-3.5 ${TEXT.faint} hover:text-red-500`} />
          </button>
        )}

        {/* Minimize (single-session only) */}
        {showMinimize && onMinimize && (
          <MinimizeButton onClick={onMinimize} />
        )}
      </div>

      {/* Expanded content — review details */}
      {isExpanded && isReview && session.audioUrl && (
        <div className="mt-3 space-y-3 animate-slide-in-content">
          <CustomAudioPlayer src={session.audioUrl} duration={session.elapsedTime} />
          <p className={`text-xs ${TEXT.faint} text-center`}>{sourceLabel}</p>

          <div className="flex items-center gap-2">
            <button
              onClick={() => recording.saveLater(session.sessionId)}
              disabled={isProcessing}
              className={`px-3 py-2.5 ${COMPONENT.secondaryButton} font-medium text-sm flex items-center justify-center gap-2 disabled:opacity-50`}
              style={{ borderRadius: UI_CONFIG.radius.xl }}
            >
              <Timer className="w-4 h-4" />
              Later
            </button>
            <button
              onClick={handleGenerateSummary}
              disabled={!hasModel || isProcessing}
              title={hasModel ? 'Generate AI summary' : 'Set up a provider first'}
              className={`flex-1 px-3 py-2.5 font-medium text-sm transition-all flex items-center justify-center gap-2 ${
                hasModel
                  ? 'bg-gradient-to-r from-violet-500 via-purple-500 to-fuchsia-500 hover:from-violet-600 hover:via-purple-600 hover:to-fuchsia-600 text-white shadow-lg shadow-purple-500/25'
                  : 'bg-parchment-300 dark:bg-night-650 text-parchment-700 dark:text-night-400 cursor-not-allowed'
              }`}
              style={{ borderRadius: UI_CONFIG.radius.xl }}
            >
              <Sparkles className="w-4 h-4" />
              Summarize
            </button>
          </div>
        </div>
      )}

      {/* Error display */}
      {session.error && (
        <div className="mt-2">
          <InfoCallout variant="error">{session.error}</InfoCallout>
        </div>
      )}
    </div>
  );
};

// === SessionRow — Router ===

interface SessionRowProps {
  session: RecordingSession;
  isActive: boolean;
  showMinimize: boolean;
  onMinimize?: () => void;
}

const SessionRow: React.FC<SessionRowProps> = ({ session, isActive, showMinimize, onMinimize }) => {
  if (isActive && (session.status === 'recording' || session.status === 'paused')) {
    return <ActiveSessionRow session={session} showMinimize={showMinimize} onMinimize={onMinimize} />;
  }
  return <CompactSessionRow session={session} showMinimize={showMinimize} onMinimize={onMinimize} />;
};

// === RecordingWidget (Tray Entry Point) ===

export const RecordingWidget: React.FC = () => {
  const { sessions, activeCaptureSessionId } = useRecordingSessions();
  const [isMinimized, setIsMinimized] = useState(false);

  const sessionArray = Array.from(sessions.values());
  if (sessionArray.length === 0) return null;

  // Sort: active capture first, then by createdAt descending
  const sorted = [...sessionArray].sort((a, b) => {
    if (a.sessionId === activeCaptureSessionId) return -1;
    if (b.sessionId === activeCaptureSessionId) return 1;
    return b.createdAt - a.createdAt;
  });

  const activeSession = activeCaptureSessionId
    ? sessions.get(activeCaptureSessionId) ?? null
    : null;

  // Minimized state: single pill for entire tray
  if (isMinimized) {
    return (
      <div
        className="fixed"
        style={{
          bottom: UI_CONFIG.spacing.lg,
          right: UI_CONFIG.spacing.lg,
          zIndex: UI_CONFIG.zIndex.overlay,
        }}
      >
        <MinimizedTrayPill
          sessions={sorted}
          activeSession={activeSession}
          onExpand={() => setIsMinimized(false)}
        />
      </div>
    );
  }

  // Expanded tray
  return (
    <div
      role="region"
      aria-label="Recording sessions"
      className={`fixed bg-parchment-50 dark:bg-night-800 border ${BORDER.strong} shadow-2xl overflow-hidden transition-all duration-300`}
      style={{
        bottom: UI_CONFIG.spacing.lg,
        right: UI_CONFIG.spacing.lg,
        width: '360px',
        zIndex: UI_CONFIG.zIndex.overlay,
        borderRadius: UI_CONFIG.radius['2xl'],
      }}
    >
      {/* Header — only for 2+ sessions */}
      {sorted.length > 1 && (
        <RecordingTrayHeader
          sessionCount={sorted.length}
          hasActiveCapture={!!activeSession}
          onMinimize={() => setIsMinimized(true)}
        />
      )}

      {/* Session rows */}
      <div className="divide-y divide-parchment-200 dark:divide-night-700">
        {sorted.map((session) => (
          <SessionRow
            key={session.sessionId}
            session={session}
            isActive={session.sessionId === activeCaptureSessionId}
            showMinimize={sorted.length === 1}
            onMinimize={() => setIsMinimized(true)}
          />
        ))}
      </div>
    </div>
  );
};

export default RecordingWidget;
