/**
 * useRecordingTimer Hook
 * 
 * Formats and manages the recording timer display.
 */

import { useMemo } from 'react';
import { useRecordingContext } from '@features/recording/context';

export const useRecordingTimer = () => {
  const { elapsedTime, status, isPaused } = useRecordingContext();
  
  // Format time as HH:MM:SS or MM:SS
  const formattedTime = useMemo(() => {
    const hours = Math.floor(elapsedTime / 3600);
    const minutes = Math.floor((elapsedTime % 3600) / 60);
    const seconds = elapsedTime % 60;
    
    const pad = (n: number) => n.toString().padStart(2, '0');
    
    if (hours > 0) {
      return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    }
    return `${pad(minutes)}:${pad(seconds)}`;
  }, [elapsedTime]);
  
  // Short format (just minutes and seconds, no padding for minutes)
  const shortTime = useMemo(() => {
    const minutes = Math.floor(elapsedTime / 60);
    const seconds = elapsedTime % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }, [elapsedTime]);
  
  // Total seconds
  const totalSeconds = elapsedTime;
  
  // Timer state
  const isRunning = status === 'recording' && !isPaused;
  const isPausedState = isPaused;
  
  return {
    elapsedTime,
    formattedTime,
    shortTime,
    totalSeconds,
    isRunning,
    isPaused: isPausedState,
  };
};

export default useRecordingTimer;
