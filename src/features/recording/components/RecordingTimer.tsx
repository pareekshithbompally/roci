/**
 * RecordingTimer Component
 * 
 * Displays the elapsed recording time with status indicator.
 */

import React from 'react';
import { Clock } from 'lucide-react';
import { useRecordingTimer } from '../hooks';
import { SURFACE, TEXT } from '@config/theme.config';

interface RecordingTimerProps {
  className?: string;
  showIcon?: boolean;
  showStatus?: boolean;
}

const RecordingTimer: React.FC<RecordingTimerProps> = ({
  className = '',
  showIcon = true,
  showStatus = false,
}) => {
  const { formattedTime, isRunning, isPaused } = useRecordingTimer();

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {showIcon && (
        <Clock className={`w-4 h-4 ${TEXT.faint}`} />
      )}
      <span className={`text-lg font-mono font-semibold ${TEXT.primary}`}>
        {formattedTime}
      </span>
      {showStatus && (
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
          isPaused 
            ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
            : isRunning
              ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
              : `${SURFACE.chip} ${TEXT.secondary}`
        }`}>
          {isPaused ? 'Paused' : isRunning ? 'Recording' : 'Stopped'}
        </span>
      )}
    </div>
  );
};

export default RecordingTimer;
