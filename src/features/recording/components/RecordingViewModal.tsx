/**
 * RecordingViewModal Component
 *
 * Full-screen modal overlay showing the active recording interface.
 * This is shown when recording is active and NOT minimized.
 * Uses Radix Dialog — Escape and click-outside minimize instead of close.
 */

import React from 'react';
import { Square, Pause, Play, Minimize2 } from 'lucide-react';
import { useRecordingContext } from '../context/RecordingContext';
import { AUDIO_CONFIG } from '@config/audio.config';
import { SURFACE, TEXT } from '@config/theme.config';
import {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogTitle,
} from '@shared/ui';

interface RecordingViewModalProps {
  open: boolean;
  onMinimize: () => void;
}

export const RecordingViewModal: React.FC<RecordingViewModalProps> = ({ open, onMinimize }) => {
  const recording = useRecordingContext();

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => { if (!isOpen) onMinimize(); }}
    >
      <DialogPortal>
        <DialogOverlay className="z-[100]" />
        <DialogContent
          className={`z-[100] max-w-none w-full h-full border-0 rounded-none ${SURFACE.page} flex items-center justify-center`}
          onEscapeKeyDown={(e) => {
            e.preventDefault();
            onMinimize();
          }}
          onPointerDownOutside={(e) => {
            e.preventDefault();
            onMinimize();
          }}
        >
          {/* Accessibility title — visually hidden */}
          <DialogTitle className="sr-only">Recording in Progress</DialogTitle>

          {/* Minimize button - top right */}
          <button
            onClick={onMinimize}
            className={`absolute top-4 right-4 p-2 ${SURFACE.hoverSubtle} rounded-xl transition-colors group`}
            title="Minimize"
          >
            <Minimize2 className={`w-5 h-5 ${TEXT.muted} group-hover:text-parchment-800 dark:group-hover:text-night-300`} />
          </button>

          {/* Recording Content - centered */}
          <div className="flex flex-col gap-6 max-w-[95%] 2xl:max-w-[1800px] w-full px-4">
            {/* Recording Status */}
            <div className="text-center space-y-2">
              <h3 className="text-2xl font-semibold">
                {recording.isPaused ? 'Recording Paused' : 'Recording in Progress...'}
              </h3>
              <p className={`text-xs uppercase tracking-[0.2em] ${TEXT.faint}`}>
                Source:{' '}
                {AUDIO_CONFIG.captureSources[recording.audioSource as keyof typeof AUDIO_CONFIG.captureSources]?.label || recording.audioSource}
              </p>
            </div>

            {/* Timer Display */}
            <div className="text-center">
              <span className={`text-6xl font-mono font-bold ${TEXT.heading}`}>
                {formatTime(recording.elapsedTime)}
              </span>
            </div>

            {/* Control Buttons */}
            <div className="flex items-center justify-center gap-4">
              {recording.isPaused ? (
                <button
                  onClick={recording.resumeRecording}
                  className="px-8 py-4 bg-green-600 hover:bg-green-700 text-white rounded-2xl font-semibold shadow-xl transition-all flex items-center justify-center gap-3"
                >
                  <Play className="w-5 h-5 fill-current" />
                  Resume
                </button>
              ) : (
                <button
                  onClick={recording.pauseRecording}
                  className="px-8 py-4 bg-amber-600 hover:bg-amber-700 text-white rounded-2xl font-semibold shadow-xl transition-all flex items-center justify-center gap-3"
                >
                  <Pause className="w-5 h-5" />
                  Pause
                </button>
              )}
              <button
                onClick={recording.stopRecording}
                className="px-8 py-4 bg-red-600 hover:bg-red-700 text-white rounded-2xl font-semibold shadow-xl transition-all flex items-center justify-center gap-3"
              >
                <Square className="w-5 h-5 fill-current" />
                Stop
              </button>
            </div>
          </div>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
};

// Format seconds to MM:SS
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export default RecordingViewModal;
