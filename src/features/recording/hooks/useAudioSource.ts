/**
 * useAudioSource Hook
 * 
 * Manages audio source selection and provides source information.
 */

import { useMemo, useCallback } from 'react';
import { useRecordingContext } from '../context';
import { AUDIO_CONFIG, type AudioCaptureSource } from '@config/audio.config';

export interface AudioSourceOption {
  value: AudioCaptureSource;
  label: string;
  description: string;
  icon?: string;
}

export const useAudioSource = () => {
  const { audioSource, setAudioSource, status } = useRecordingContext();
  
  // Available audio sources from config
  const availableSources: AudioSourceOption[] = useMemo(() => {
    return Object.entries(AUDIO_CONFIG.captureSources).map(([key, config]) => ({
      value: key as AudioCaptureSource,
      label: config.label,
      description: config.description,
    }));
  }, []);
  
  // Current source info
  const currentSourceInfo = useMemo(() => {
    const config = AUDIO_CONFIG.captureSources[audioSource];
    return {
      value: audioSource,
      label: config?.label || 'Unknown',
      description: config?.description || '',
    };
  }, [audioSource]);
  
  // Can change source (only when not recording)
  const canChangeSource = status === 'idle';
  
  // Change source handler with validation
  const changeSource = useCallback((source: AudioCaptureSource) => {
    if (!canChangeSource) {
      console.warn('Cannot change audio source while recording');
      return;
    }
    setAudioSource(source);
  }, [canChangeSource, setAudioSource]);
  
  return {
    audioSource,
    availableSources,
    currentSourceInfo,
    canChangeSource,
    changeSource,
  };
};

export default useAudioSource;
