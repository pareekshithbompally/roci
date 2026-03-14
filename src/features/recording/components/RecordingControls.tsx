/**
 * RecordingControls Component
 * 
 * Full recording control panel with source selection and actions.
 */

import React from 'react';
import { Pause, Play, Square, Mic, Monitor, Radio, Upload } from 'lucide-react';
import { useRecording, useAudioSource } from '../hooks';
import RecordingTimer from './RecordingTimer';
import { SURFACE, BORDER, TEXT, COMPONENT } from '@config/theme.config';
import type { AudioCaptureSource } from '../../../../src/config/audio.config';

interface RecordingControlsProps {
  onProcess?: () => void;
  onDiscard?: () => void;
  className?: string;
}

const sourceIcons: Record<AudioCaptureSource, React.ReactNode> = {
  microphone: <Mic className="w-4 h-4" />,
  system: <Monitor className="w-4 h-4" />,
  systemAndMicrophone: <Radio className="w-4 h-4" />,
  'file-upload': <Upload className="w-4 h-4" />,
};

const RecordingControls: React.FC<RecordingControlsProps> = ({
  onProcess,
  onDiscard,
  className = '',
}) => {
  const { 
    status, 
    isPaused,
    pauseRecording, 
    resumeRecording, 
    stopRecording,
    discardRecording,
  } = useRecording();
  
  const { 
    audioSource, 
    availableSources, 
    canChangeSource, 
    changeSource,
    currentSourceInfo,
    permissionMessage,
  } = useAudioSource();

  const isRecording = status === 'recording';
  const isReview = status === 'review';

  // Recording in progress controls
  if (isRecording) {
    return (
      <div className={`space-y-4 ${className}`}>
        {/* Status */}
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${isPaused ? 'bg-amber-500' : 'bg-red-500 animate-pulse'}`} />
          <span className={`font-semibold ${TEXT.secondary}`}>
            {isPaused ? 'Recording Paused' : 'Recording in Progress...'}
          </span>
        </div>

        {/* Timer */}
        <RecordingTimer showStatus />

        {/* Source info */}
        <p className={`text-sm ${TEXT.muted}`}>
          Source: {currentSourceInfo.label}
        </p>

        {/* Controls */}
        <div className="flex items-center gap-2">
          {isPaused ? (
            <button
              onClick={resumeRecording}
              className="flex-1 px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-medium transition-all flex items-center justify-center gap-2"
            >
              <Play className="w-5 h-5 fill-current" />
              Resume
            </button>
          ) : (
            <button
              onClick={pauseRecording}
              className="flex-1 px-4 py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-medium transition-all flex items-center justify-center gap-2"
            >
              <Pause className="w-5 h-5" />
              Pause
            </button>
          )}
          <button
            onClick={stopRecording}
            className="px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-medium transition-all flex items-center justify-center gap-2"
          >
            <Square className="w-5 h-5 fill-current" />
            Stop
          </button>
        </div>
      </div>
    );
  }

  // Review state controls
  if (isReview) {
    return (
      <div className={`space-y-4 ${className}`}>
        <RecordingTimer />
        <div className="flex gap-2">
          <button
            onClick={onDiscard || discardRecording}
            className={`flex-1 py-4 rounded-2xl border ${BORDER.default} font-semibold ${SURFACE.hoverSubtle} transition-colors`}
          >
            Discard
          </button>
          <button
            onClick={onProcess}
            className={`flex-1 py-4 ${COMPONENT.primaryButton} rounded-2xl font-semibold shadow-xl transition-all`}
          >
            Process
          </button>
        </div>
      </div>
    );
  }

  // Idle state - source selection
  return (
    <div className={`space-y-4 ${className}`}>
      {/* Source Selection */}
      <div className="space-y-2">
        <label className={`text-sm font-medium ${TEXT.secondary}`}>
          Audio Source
        </label>
        <div className="grid grid-cols-1 gap-2">
          {availableSources.map((source) => (
            <button
              key={source.value}
              onClick={() => changeSource(source.value)}
              disabled={!canChangeSource}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${
                audioSource === source.value
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                  : `${BORDER.strong} ${SURFACE.hoverSubtle}`
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <span className={audioSource === source.value ? 'text-blue-600' : TEXT.muted}>
                {sourceIcons[source.value]}
              </span>
              <div className="text-left">
                <div className={`font-medium ${audioSource === source.value ? 'text-blue-600' : TEXT.secondary}`}>
                  {source.label}
                </div>
                <div className={`text-xs ${TEXT.muted}`}>{source.description}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Permission message */}
      <p className={`text-xs ${TEXT.muted}`}>
        {permissionMessage}
      </p>
    </div>
  );
};

export default RecordingControls;
