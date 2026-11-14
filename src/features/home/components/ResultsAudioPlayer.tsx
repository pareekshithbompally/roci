import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import CustomAudioPlayer from '@features/home/components/CustomAudioPlayer';
import { useAudioQuery } from '@features/home/hooks/useAudioQuery';
import { useAudioPlayerStore } from '@shared/stores/audioPlayerStore';
import { Surface } from '@shared/ui';

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

  // Auto-start once per loaded URL. A plain currentSession dep would
  // resurrect playback after the user stops it (session nulls out).
  const startedForUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!audioUrl || !meetingId) return;

    // Don't overwrite an active session for a different meeting
    if (currentSession && currentSession.meetingId !== meetingId) return;
    if (startedForUrlRef.current === audioUrl) return;

    startedForUrlRef.current = audioUrl;
    startSession({ src: audioUrl, meetingId, title, duration });
  }, [audioUrl, meetingId, title, duration, startSession, currentSession?.meetingId]);

  // Don't render the full player for a different meeting when another session is active
  const isSessionOwner = currentSession?.meetingId === meetingId;
  const isBlocked = !!currentSession && !isSessionOwner && !isLoading;

  if (isLoading) {
    return (
      <div className="px-12 py-2">
        <Surface variant="card" radius="lg" className="flex flex-col gap-2 p-3">
          <div className="flex items-center gap-2">
            <Surface variant="inset" radius="full" className="w-8 h-8 animate-pulse" />
            <Surface variant="inset" radius="md" className="w-16 h-3 animate-pulse" />
            <div className="flex-1" />
            <Surface variant="inset" radius="md" className="w-16 h-3 animate-pulse" />
          </div>
          <Surface variant="inset" radius="md" className="h-10 w-full animate-pulse" />
        </Surface>
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
