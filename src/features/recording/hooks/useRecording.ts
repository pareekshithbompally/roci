/** Convenience access to the recording context. */

import { useRecordingContext } from '@features/recording/context';

export const useRecording = () => {
  const context = useRecordingContext();
  
  return {
    // State
    status: context.status,
    elapsedTime: context.elapsedTime,
    isPaused: context.isPaused,
    audioSource: context.audioSource,
    recordingId: context.recordingId,
    recordingFilename: context.recordingFilename,
    recordedBlob: context.recordedBlob,
    audioUrl: context.audioUrl,
    error: context.error,
    
    // Computed
    isRecording: context.isRecording,
    canRecord: context.canRecord,
    
    // Actions
    startRecording: context.startRecording,
    stopRecording: context.stopRecording,
    pauseRecording: context.pauseRecording,
    resumeRecording: context.resumeRecording,
    discardRecording: context.discardRecording,
    setAudioSource: context.setAudioSource,
    resetRecording: context.resetRecording,
  };
};

export default useRecording;
