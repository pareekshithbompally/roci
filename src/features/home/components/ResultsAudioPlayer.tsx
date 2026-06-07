import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import CustomAudioPlayer from '@shared/components/CustomAudioPlayer';
import { useAudioQuery } from '@features/home/hooks/useAudioQuery';
import { useAudioPlayerStore } from '@shared/stores/audioPlayerStore';
import { AUDIO, SURFACE } from '@config/theme.config';

interface ResultsAudioPlayerProps {
  recordingFileName: string;
  meetingId: string;
  title: string;
}

export const ResultsAudioPlayer: React.FC<ResultsAudioPlayerProps> = ({
  recordingFileName,
  meetingId,
  title,
}) => {
  const { audioUrl, duration, isLoading, error } = useAudioQuery(recordingFileName);
  const startSession = useAudioPlayerStore((s) => s.startSession);
  const currentSession = useAudioPlayerStore((s) => s.session);

  useEffect(() => {
    if (!audioUrl || !meetingId) return;

    // Don't overwrite an active session for a different meeting
    if (currentSession && currentSession.meetingId !== meetingId) return;

    startSession({ src: audioUrl, meetingId, title, duration });
  }, [audioUrl, meetingId, title, duration, startSession, currentSession?.meetingId]);

  // Don't render the full player for a different meeting when another session is active
  const isSessionOwner = currentSession?.meetingId === meetingId;
  const isBlocked = !!currentSession && !isSessionOwner && !isLoading;

  if (isLoading) {
    return (
      <div className="px-12 py-2">
        <div className={`flex flex-col gap-2 ${AUDIO.shell} p-3`}>
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full ${SURFACE.skeleton}`} />
            <div className={`w-16 h-3 rounded ${SURFACE.skeleton}`} />
            <div className="flex-1" />
            <div className={`w-16 h-3 rounded ${SURFACE.skeleton}`} />
          </div>
          <div className={`${AUDIO.waveform} ${SURFACE.skeleton}`} />
        </div>
      </div>
    );
  }

  if (error || !audioUrl || isBlocked) {
    return null;
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key="audio-player"
        initial={{ opacity: 0, scale: 0.92, y: -16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: -16 }}
        transition={{ type: 'spring', stiffness: 450, damping: 32, mass: 0.9 }}
        className="px-12 py-2"
      >
        <CustomAudioPlayer src={audioUrl} duration={duration} meetingId={meetingId} />
      </motion.div>
    </AnimatePresence>
  );
};

export default ResultsAudioPlayer;
