/** Meeting audio that keeps playing after its meeting is left: the player lives here, mounted once by the always-present activity surface. */

import { useCallback, useEffect, useRef } from 'react';
import { useAudioPlayerStore } from '@shared/stores/audioPlayerStore';
import { useSelectedHistoryId } from '@shared/stores/appStore';

export const SKIP_SECONDS = 15;

export interface MinimizedAudio {
  title: string;
  duration: number;
  currentTime: number;
  isPlaying: boolean;
  toggle: () => void;
  skip: () => void;
  seek: (seconds: number) => void;
  stop: () => void;
}

/** The player while a meeting's audio plays away from its meeting, else null. */
export function useMinimizedAudio(): MinimizedAudio | null {
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
  // Every hook runs on every render (rules of hooks): read the open meeting before deciding.
  const openMeetingId = useSelectedHistoryId();
  const minimized = !!session && session.meetingId !== openMeetingId && isPlaying;

  const failed = (error: unknown) => console.error('[MinimizedAudio] playback failed:', error);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.currentTime = currentTime;
      audio.play().catch(failed);
    } else {
      audio.pause();
    }
  }, [currentTime]);

  const seek = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const next = Math.max(0, Math.min(seconds, audio.duration || 0));
    audio.currentTime = next;
    updateCurrentTime(next);
  }, [updateCurrentTime]);

  const skip = useCallback(() => seek((audioRef.current?.currentTime ?? 0) + SKIP_SECONDS), [seek]);

  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.src = '';
    }
    stopSession();
  }, [stopSession]);

  // The player exists only while minimized; the meeting view plays its own audio otherwise.
  useEffect(() => {
    if (!minimized || !session) return;
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
    const onLoaded = () => {
      audio.currentTime = useAudioPlayerStore.getState().currentTime;
      if (useAudioPlayerStore.getState().isPlaying) audio.play().catch(failed);
    };
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('loadedmetadata', onLoaded);
    return () => {
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('loadedmetadata', onLoaded);
      audio.pause();
      audio.src = '';
      audioRef.current = null;
    };
    // Recreated only for a new source or on (un)minimizing; rate and volume follow below.
  }, [minimized, session?.src]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = playbackRate;
  }, [playbackRate]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = isMuted ? 0 : volume;
    audio.muted = isMuted;
  }, [volume, isMuted]);

  if (!minimized || !session) return null;
  return { title: session.title, duration: session.duration, currentTime, isPlaying, toggle, skip, seek, stop };
}
