/** Audio whose player is off screen (its meeting or chat left): the playback element's controls, paused or playing. */

import { useCallback } from 'react';
import { useAudioPlayerStore } from '@shared/stores/audioPlayerStore';
import { PLAYER_CONFIG } from '@config/player.config';

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

/** The controls while audio is loaded (playing or paused) with no player of it on screen, else null; Stop dismisses it. */
export function useMinimizedAudio(): MinimizedAudio | null {
  const session = useAudioPlayerStore((s) => s.session);
  const isPlaying = useAudioPlayerStore((s) => s.isPlaying);
  const currentTime = useAudioPlayerStore((s) => s.currentTime);
  const viewsOnScreen = useAudioPlayerStore((s) => s.viewsOnScreen);
  const toggle = useAudioPlayerStore((s) => s.toggle);
  const skipBy = useAudioPlayerStore((s) => s.skip);
  const seek = useAudioPlayerStore((s) => s.seek);
  const stop = useAudioPlayerStore((s) => s.stop);
  const skip = useCallback(() => skipBy(PLAYER_CONFIG.skipSeconds), [skipBy]);

  if (!session || viewsOnScreen > 0) return null;
  return { title: session.title, duration: session.duration, currentTime, isPlaying, toggle, skip, seek, stop };
}
