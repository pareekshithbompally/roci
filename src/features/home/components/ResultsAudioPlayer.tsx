import React, { useEffect, useRef } from 'react';
import CustomAudioPlayer from '@features/home/components/CustomAudioPlayer';
import { useAudioQuery } from '@features/home/hooks/useAudioQuery';
import { useAudioPlayerStore } from '@shared/stores/audioPlayerStore';
import { LAYOUT } from '@config/layout.config';


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

  // Auto-start once per URL; keying on the session would restart playback after the user stops it.
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

  // No skeleton or entrance of its own: it appears in place with the page, so nothing below it jumps twice.
  if (isLoading || error || !audioUrl || isBlocked) return null;

  return (
    <div className={`${LAYOUT.pageGutter} py-2`}>
      <div className={LAYOUT.pageColumn}>
        <CustomAudioPlayer src={audioUrl} duration={duration} meetingId={meetingId} />
      </div>
    </div>
  );
};

export default ResultsAudioPlayer;
