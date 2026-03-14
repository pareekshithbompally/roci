/**
 * MinimizedRecordingBar Component
 * 
 * Floating bar shown when recording is in progress and the main panel is closed.
 * Uses the recording context for state and actions.
 */

import React from 'react';
import { Pause, Play, Square, Maximize2, Clock } from 'lucide-react';
import { useRecording, useRecordingTimer, useAudioSource } from '../hooks';
import { useApp } from '@shared/contexts/AppContext';
import { useChat } from '@shared/contexts/ChatContext';
import { SURFACE, BORDER, TEXT } from '@config/theme.config';

interface MinimizedRecordingBarProps {
  onExpand: () => void;
}

const MinimizedRecordingBar: React.FC<MinimizedRecordingBarProps> = ({
  onExpand,
}) => {
  const { isPaused, pauseRecording, resumeRecording, stopRecording } = useRecording();
  const { formattedTime } = useRecordingTimer();
  const { currentSourceInfo } = useAudioSource();
  const { setCurrentView, setSelectedHistoryId, setResult } = useApp();
  const chat = useChat();

  const handleExpand = () => {
    // Navigate to home to show recording view
    setCurrentView('home');
    setSelectedHistoryId(null);
    chat.setCurrentSessionId(null);
    setResult(null);
    // Then expand
    onExpand();
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 animate-slide-in-bottom">
      <div className={`${SURFACE.card} border ${BORDER.strong} rounded-2xl shadow-2xl p-4 min-w-[320px] backdrop-blur-xl bg-opacity-95 dark:bg-opacity-95`}>
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className={`w-2.5 h-2.5 rounded-full ${isPaused ? 'bg-amber-500' : 'bg-red-500 animate-pulse'}`} />
            <span className={`text-xs font-semibold ${TEXT.secondary}`}>
              {isPaused ? 'Paused' : 'Recording'}
            </span>
          </div>
          <button
            onClick={handleExpand}
            className={`p-1.5 ${SURFACE.hoverSubtle} rounded-lg transition-colors group`}
            title="Expand"
          >
            <Maximize2 className={`w-4 h-4 ${TEXT.muted} group-hover:text-parchment-800 dark:group-hover:text-night-300`} />
          </button>
        </div>

        {/* Timer & Source */}
        <div className="mb-3 space-y-1">
          <div className="flex items-center gap-2">
            <Clock className={`w-3.5 h-3.5 ${TEXT.faint}`} />
            <span className={`text-lg font-mono font-semibold ${TEXT.primary}`}>
              {formattedTime}
            </span>
          </div>
          <p className={`text-xs ${TEXT.muted} truncate`}>
            {currentSourceInfo.label}
          </p>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          {isPaused ? (
            <button
              onClick={resumeRecording}
              className="flex-1 px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl font-medium text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-green-500/20"
              title="Resume"
            >
              <Play className="w-4 h-4 fill-current" />
              Resume
            </button>
          ) : (
            <button
              onClick={pauseRecording}
              className="flex-1 px-3 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-medium text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20"
              title="Pause"
            >
              <Pause className="w-4 h-4" />
              Pause
            </button>
          )}
          <button
            onClick={stopRecording}
            className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl font-medium text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-red-500/20"
            title="Stop"
          >
            <Square className="w-4 h-4 fill-current" />
            Stop
          </button>
        </div>
      </div>
    </div>
  );
};

export default MinimizedRecordingBar;
