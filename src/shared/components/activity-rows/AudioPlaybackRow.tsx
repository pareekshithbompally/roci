import React, { useRef, useEffect, useCallback } from 'react';
import { Play, Pause, SkipForward, Square } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAudioPlayerStore } from '@shared/stores/audioPlayerStore';
import { useSelectedHistoryId } from '@shared/stores/appStore';
import { formatTime } from '@shared/utils/audio.utils';
import { Button, Text } from '@shared/ui';

const SKIP_SECONDS = 15;

export const AudioPlaybackRow: React.FC = () => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const session = useAudioPlayerStore((s) => s.session);
  const isPlaying = useAudioPlayerStore((s) => s.isPlaying);
  const currentTime = useAudioPlayerStore((s) => s.currentTime);
  const playbackRate = useAudioPlayerStore((s) => s.playbackRate);
  const volume = useAudioPlayerStore((s) => s.volume);
  const isMuted = useAudioPlayerStore((s) => s.isMuted);
  const stopSession = useAudioPlayerStore((s) => s.stopSession);
  const setPlaying = useAudioPlayerStore((s) => s.setPlaying);
  const updateCurrentTime = useAudioPlayerStore((s) => s.updateCurrentTime);
  const selectedHistoryId = useSelectedHistoryId();

  const isMinimized = !!session && session.meetingId !== selectedHistoryId && isPlaying;

  const handleTogglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (audio.paused) {
      audio.currentTime = currentTime;
      audio.play().catch((error: unknown) =>
        console.error('[AudioPlaybackRow] Playback failed:', error)
      );
    } else {
      audio.pause();
    }
  }, [currentTime]);

  const handleSkipForward = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const next = Math.min(audio.currentTime + SKIP_SECONDS, audio.duration || 0);
    audio.currentTime = next;
    updateCurrentTime(next);
  }, [updateCurrentTime]);

  const handleSeek = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const audio = audioRef.current;
      if (!audio) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const next = ratio * (audio.duration || 0);
      audio.currentTime = next;
      updateCurrentTime(next);
    },
    [updateCurrentTime],
  );

  const handleStop = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.src = '';
    }
    stopSession();
  }, [stopSession]);

  // Create/teardown fallback audio element only when minimized
  useEffect(() => {
    if (!isMinimized || !session) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
        audioRef.current = null;
      }
      return;
    }

    const audio = new Audio(session.src);
    audio.preload = 'auto';
    audio.volume = isMuted ? 0 : volume;
    audio.muted = isMuted;
    audio.playbackRate = playbackRate;
    audioRef.current = audio;

    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onTimeUpdate = () => updateCurrentTime(audio.currentTime);
    const onEnded = () => stopSession();
    const onLoadedMetadata = () => {
      audio.currentTime = currentTime;
      if (isPlaying) {
        audio.play().catch((error: unknown) =>
        console.error('[AudioPlaybackRow] Playback failed:', error)
      );
      }
    };

    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);

    return () => {
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.pause();
      audio.src = '';
      audioRef.current = null;
    };
  }, [isMinimized, session?.src]);

  // Sync playback rate
  useEffect(() => {
    const audio = audioRef.current;
    if (audio) audio.playbackRate = playbackRate;
  }, [playbackRate]);

  // Sync volume
  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.volume = isMuted ? 0 : volume;
      audio.muted = isMuted;
    }
  }, [volume, isMuted]);

  if (!isMinimized || !session) return null;

  const progress = session.duration > 0 ? Math.min(currentTime / session.duration, 1) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      transition={{ type: 'spring', stiffness: 500, damping: 35, mass: 0.8 }}
      className="px-3 py-2.5 space-y-1.5 overflow-hidden"
    >
      {/* Title row with stop */}
      <div className="flex items-center gap-2 min-w-0">
        <motion.div
          className="w-2.5 h-2.5 rounded-full bg-success shrink-0"
          animate={isPlaying ? { scale: [1, 1.3, 1] } : { scale: 1 }}
          transition={{ repeat: isPlaying ? Infinity : 0, duration: 1 }}
        />
        <Text variant="label" truncate className="flex-1 min-w-0">{session.title}</Text>
        <Button variant="ghost" size="iconXs" onClick={handleStop} aria-label="Stop playback" title="Stop playback">
          <Square className="w-3 h-3 fill-current" />
        </Button>
      </div>

      {/* Controls + time row */}
      <div className="flex items-center gap-1.5 min-w-0 pl-5.5">
        <Button variant="ghost" size="iconXs" onClick={handleTogglePlay} aria-label={isPlaying ? 'Pause' : 'Play'} title={isPlaying ? 'Pause' : 'Play'}>
          {isPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
        </Button>
        <Button variant="ghost" size="iconXs" onClick={handleSkipForward} aria-label={`Skip forward ${SKIP_SECONDS}s`} title={`Skip forward ${SKIP_SECONDS}s`}>
          <SkipForward className="w-3 h-3" />
        </Button>

        {/* Seek bar */}
        <div
          onClick={handleSeek}
          className="flex-1 h-4 flex items-center cursor-pointer group"
          role="slider"
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
        >
          <div className="w-full h-1 rounded-full relative overflow-hidden bg-layer-3">
            <motion.div
              className="absolute inset-y-0 left-0 rounded-full bg-success"
              animate={{ width: `${progress * 100}%` }}
              transition={{ type: 'tween', duration: 0.1 }}
            />
          </div>
        </div>

        <Text variant="caption" tone="muted" className="font-mono shrink-0">
          {formatTime(currentTime)} / {formatTime(session.duration)}
        </Text>
      </div>
    </motion.div>
  );
};
