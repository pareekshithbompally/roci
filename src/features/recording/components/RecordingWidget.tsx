/**
 * RecordingWidget Component (Session-Based)
 *
 * Renders a stack of session widgets — one per active recording session.
 * Supports multiple concurrent sessions (only one can be capturing at a time).
 *
 * Features:
 * - RecordingWidgetStack: iterates sessions Map, renders SessionWidget per session
 * - SessionWidget: recording/review/processing UI per session
 * - Collapse: when 3+ sessions exist, older ones collapse into compact pills
 * - "Later" replaces "Discard" in review state
 * - Small trash icon for actual discard in collapsed/menu area
 */

import React, { useState } from 'react';
import { Pause, Play, Square, Clock, Loader2, Sparkles, Trash2, Minimize2, X, Timer, Mic } from 'lucide-react';
import { useRecordingSessions } from '../context/RecordingContext';
import { AUDIO_CONFIG } from '@config/audio.config';
import { UI_CONFIG } from '@config/ui.config';
import { SURFACE, BORDER, TEXT, COMPONENT } from '@config/theme.config';
import CustomAudioPlayer from '@/components/CustomAudioPlayer';
import type { RecordingSession } from '../types';

// Format time as MM:SS
const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

// === SessionWidget: Single session UI ===

interface SessionWidgetProps {
  session: RecordingSession;
  isCollapsed: boolean;
  onExpand: () => void;
}

const SessionWidget: React.FC<SessionWidgetProps> = ({ session, isCollapsed, onExpand }) => {
  const recording = useRecordingSessions();
  const [isProcessing, setIsProcessing] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);

  const sourceLabel = AUDIO_CONFIG.captureSources[
    session.audioSource as keyof typeof AUDIO_CONFIG.captureSources
  ]?.label || session.audioSource;

  const handleGenerateSummary = async () => {
    setIsProcessing(true);
    try {
      await recording.processRecording(session.sessionId);
    } catch (error: any) {
      if (error.message === 'Processing aborted by user') {
        console.log('[SessionWidget] Processing aborted by user');
      } else {
        console.error('[SessionWidget] Processing failed:', error);
      }
      setIsProcessing(false);
    }
  };

  const handleAbortProcessing = () => {
    recording.abortProcessing(session.sessionId);
    setIsProcessing(false);
  };

  const handleSaveLater = async () => {
    await recording.saveLater(session.sessionId);
  };

  // === COLLAPSED PILL ===
  if (isCollapsed) {
    const isRecording = session.status === 'recording' || session.status === 'paused';

    return (
      <button
        onClick={onExpand}
        className={`flex items-center gap-2 px-3 py-2 bg-parchment-50 dark:bg-night-800 border ${BORDER.strong} shadow-lg transition-all hover:scale-105 cursor-pointer`}
        style={{ borderRadius: UI_CONFIG.radius.xl }}
      >
        {isRecording ? (
          <>
            <div className={`w-2 h-2 rounded-full ${session.isPaused ? 'bg-amber-500' : 'bg-red-500 animate-pulse'}`} />
            <span className={`text-xs font-mono font-semibold ${TEXT.secondary}`}>
              {formatTime(session.elapsedTime)}
            </span>
          </>
        ) : isProcessing ? (
          <>
            <Loader2 className="w-3 h-3 animate-spin text-purple-500" />
            <span className={`text-xs font-medium ${TEXT.secondary}`}>Processing</span>
          </>
        ) : (
          <>
            <Mic className={`w-3 h-3 ${TEXT.muted}`} />
            <span className={`text-xs font-medium ${TEXT.secondary}`}>Review</span>
          </>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            recording.discardRecording(session.sessionId);
          }}
          className="p-0.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-colors ml-1"
          aria-label="Discard recording"
        >
          <Trash2 className={`w-3 h-3 ${TEXT.faint} hover:text-red-500`} />
        </button>
      </button>
    );
  }

  // === MINIMIZED STATE ===
  if (isMinimized) {
    return (
      <button
        onClick={() => setIsMinimized(false)}
        className="group cursor-pointer transition-all duration-300 hover:scale-110"
        aria-label="Expand recording widget"
      >
        <div className="relative">
          <div
            className={`flex items-center justify-center ${
              session.isPaused ? 'bg-amber-500'
                : session.status === 'review' ? 'bg-parchment-700 dark:bg-night-500'
                : 'bg-red-500'
            } shadow-2xl transition-all duration-300`}
            style={{
              width: '56px',
              height: '56px',
              borderRadius: UI_CONFIG.radius.full,
            }}
          >
            <span className="text-white font-mono font-bold text-xs">
              {formatTime(session.elapsedTime)}
            </span>
          </div>
          <div
            className={`absolute inset-0 ${
              session.isPaused ? 'bg-amber-500/20' : 'bg-red-500/20'
            } blur-xl -z-10`}
            style={{ borderRadius: UI_CONFIG.radius.full }}
          />
        </div>
      </button>
    );
  }

  // === EXPANDED WIDGET ===
  return (
    <div
      className={`bg-parchment-50 dark:bg-night-800 border ${BORDER.strong} shadow-2xl transition-all duration-300`}
      style={{
        width: '360px',
        borderRadius: UI_CONFIG.radius['2xl'],
      }}
    >
      {/* STATE 1: Recording Active */}
      {(session.status === 'recording' || session.status === 'paused') && (
        <div className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div
                className={`rounded-full ${
                  session.isPaused ? 'bg-amber-500' : 'bg-red-500 animate-pulse'
                }`}
                style={{ width: '10px', height: '10px' }}
              />
              <span className={`text-sm font-semibold ${TEXT.secondary}`}>
                {session.isPaused ? 'Recording Paused' : 'Recording'}
              </span>
            </div>
            <button
              onClick={() => setIsMinimized(true)}
              className={`p-1.5 ${SURFACE.hoverSubtle} transition-colors rounded-lg`}
              aria-label="Minimize widget"
            >
              <Minimize2 className={`w-4 h-4 ${TEXT.muted}`} />
            </button>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Clock className={`w-4 h-4 ${TEXT.faint}`} />
              <span className={`text-2xl font-mono font-bold ${TEXT.primary}`}>
                {formatTime(session.elapsedTime)}
              </span>
            </div>
            <p className={`text-xs ${TEXT.secondary} truncate`}>
              {sourceLabel}
            </p>
          </div>

          <div className="flex items-center gap-2">
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
          </div>
        </div>
      )}

      {/* STATE 2: Review (with inline processing) */}
      {session.status === 'review' && session.audioUrl && (
        <div className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className={`text-lg font-semibold ${TEXT.heading}`}>
              Session Complete
            </h3>
            <div className="flex items-center gap-1">
              <button
                onClick={() => recording.discardRecording(session.sessionId)}
                disabled={isProcessing}
                className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors rounded-lg disabled:opacity-50"
                aria-label="Discard recording"
                title="Discard"
              >
                <Trash2 className={`w-4 h-4 ${TEXT.faint} hover:text-red-500`} />
              </button>
              <button
                onClick={() => setIsMinimized(true)}
                className={`p-1.5 ${SURFACE.hoverSubtle} transition-colors rounded-lg`}
                aria-label="Minimize widget"
              >
                <Minimize2 className={`w-4 h-4 ${TEXT.muted}`} />
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <CustomAudioPlayer src={session.audioUrl} duration={session.elapsedTime} />
            <p className={`text-xs ${TEXT.secondary} text-center`}>
              {sourceLabel}
            </p>
          </div>

          {/* Action Buttons: Later + Summarize */}
          <div className="flex items-center gap-2">
            {/* Later button */}
            <button
              onClick={handleSaveLater}
              disabled={isProcessing}
              className={`px-4 py-3 ${COMPONENT.secondaryButton} font-medium text-sm flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed`}
              style={{ borderRadius: UI_CONFIG.radius.xl }}
            >
              <Timer className="w-4 h-4" />
              Later
            </button>

            {/* Summarize / Processing / Abort button */}
            {!isProcessing ? (
              <button
                onClick={handleGenerateSummary}
                className="flex-1 px-4 py-3 bg-gradient-to-r from-violet-500 via-purple-500 to-fuchsia-500 hover:from-violet-600 hover:via-purple-600 hover:to-fuchsia-600 text-white font-medium text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-purple-500/25"
                style={{ borderRadius: UI_CONFIG.radius.xl }}
              >
                <Sparkles className="w-4 h-4" />
                Summarize
              </button>
            ) : (
              <div className="flex flex-1 gap-2">
                <button
                  disabled
                  className="flex-1 px-4 py-3 bg-gradient-to-r from-violet-500 via-purple-500 to-fuchsia-500 text-white font-medium text-sm shadow-lg shadow-purple-500/25 flex items-center justify-center gap-2 cursor-not-allowed opacity-90"
                  style={{ borderRadius: UI_CONFIG.radius.xl }}
                >
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Processing...
                </button>
                <button
                  onClick={handleAbortProcessing}
                  className="px-3 py-3 bg-red-600 hover:bg-red-700 text-white transition-all flex items-center justify-center shadow-lg shadow-red-500/20"
                  style={{ borderRadius: UI_CONFIG.radius.xl }}
                  aria-label="Cancel processing"
                  title="Cancel processing"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// === RecordingWidgetStack: Container for all session widgets ===

export const RecordingWidget: React.FC = () => {
  const { sessions, activeCaptureSessionId } = useRecordingSessions();
  const [expandedCollapsedId, setExpandedCollapsedId] = useState<string | null>(null);

  const sessionArray = Array.from(sessions.values());
  if (sessionArray.length === 0) return null;

  // Sort: active capture first, then by createdAt descending
  const sorted = [...sessionArray].sort((a, b) => {
    if (a.sessionId === activeCaptureSessionId) return -1;
    if (b.sessionId === activeCaptureSessionId) return 1;
    return b.createdAt - a.createdAt;
  });

  // Collapse logic: if 3+ sessions, older ones collapse
  // Active capture + newest session stay expanded. Rest collapse.
  const shouldCollapse = sorted.length >= 3;

  return (
    <div
      className="fixed flex flex-col-reverse items-end gap-2"
      style={{
        bottom: UI_CONFIG.spacing.lg,
        right: UI_CONFIG.spacing.lg,
        zIndex: UI_CONFIG.zIndex.overlay,
      }}
    >
      {sorted.map((session, index) => {
        // First two are always expanded (unless user explicitly collapsed them)
        const isCollapsed = shouldCollapse
          && index >= 2
          && expandedCollapsedId !== session.sessionId;

        return (
          <div
            key={session.sessionId}
            className="animate-slide-in-bottom"
            style={{ animation: 'slideInBottom 0.3s ease-out' }}
          >
            <SessionWidget
              session={session}
              isCollapsed={isCollapsed}
              onExpand={() => setExpandedCollapsedId(session.sessionId)}
            />
          </div>
        );
      })}
    </div>
  );
};

export default RecordingWidget;
