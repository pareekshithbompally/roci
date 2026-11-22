/** Audio playback: the one audio element every player drives, the session loaded in it, and the listener's rate and
 *  volume (kept across launches). The element's own events set `isPlaying` and `currentTime`; nothing polls. */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/** What the element plays: a meeting's recording, a chat's audio. `id` says whose it is. */
export interface PlaybackSession {
  id: string;
  src: string;
  title: string;
  duration: number;
}

type AudioPlayerStoreState = {
  playbackRate: number;
  volume: number;
  isMuted: boolean;
  /** The session loaded in the element, kept after it pauses or ends; cleared on stop. */
  session: PlaybackSession | null;
  isPlaying: boolean;
  /** Position in seconds. */
  currentTime: number;
  /** Players on screen showing the loaded session; none while it plays means the minimized player shows it. */
  viewsOnScreen: number;

  setPlaybackRate: (rate: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;

  /** Loads `session` unless it is already loaded (then its position is kept). */
  load: (session: PlaybackSession) => void;
  /** Loads `session` if needed, then plays. */
  play: (session: PlaybackSession) => void;
  toggle: () => void;
  seek: (seconds: number) => void;
  skip: (seconds: number) => void;
  stop: () => void;
  viewShown: () => void;
  viewHidden: () => void;
};

let element: HTMLAudioElement | null = null;

const failed = (error: unknown) => console.error('[AudioPlayer] Playback failed:', error);

/** The rate and volume the listener chose, applied to the element. */
function applyPreferences(audio: HTMLAudioElement): void {
  const { playbackRate, volume, isMuted } = useAudioPlayerStore.getState();
  audio.defaultPlaybackRate = playbackRate;
  audio.playbackRate = playbackRate;
  audio.volume = volume;
  audio.muted = isMuted;
}

/** The element's events are the only source of play state and position. */
function listen(audio: HTMLAudioElement): void {
  const set = useAudioPlayerStore.setState;
  audio.addEventListener('play', () => set({ isPlaying: true }));
  audio.addEventListener('pause', () => set({ isPlaying: false }));
  audio.addEventListener('ended', () => set({ isPlaying: false }));
  audio.addEventListener('timeupdate', () => set({ currentTime: audio.currentTime }));
  audio.addEventListener('durationchange', () => {
    const { session } = useAudioPlayerStore.getState();
    if (session && Number.isFinite(audio.duration)) set({ session: { ...session, duration: audio.duration } });
  });
}

/** The one audio element, made on first use; the playing session's waveform is drawn on it. */
export function playbackElement(): HTMLAudioElement {
  if (element) return element;
  element = new Audio();
  element.preload = 'metadata';
  listen(element);
  applyPreferences(element);
  return element;
}

export const useAudioPlayerStore = create<AudioPlayerStoreState>()(
  persist(
    (set, get) => ({
      playbackRate: 1,
      volume: 1,
      isMuted: false,
      session: null,
      isPlaying: false,
      currentTime: 0,
      viewsOnScreen: 0,

      setPlaybackRate: (rate) => {
        set({ playbackRate: rate });
        if (element) applyPreferences(element);
      },
      setVolume: (volume) => {
        set({ volume, isMuted: volume === 0 ? true : get().isMuted });
        if (element) applyPreferences(element);
      },
      toggleMute: () => {
        set((s) => ({ isMuted: !s.isMuted }));
        if (element) applyPreferences(element);
      },

      load: (session) => {
        if (get().session?.id === session.id) return;
        const audio = playbackElement();
        audio.pause();
        audio.src = session.src;
        applyPreferences(audio);
        set({ session, isPlaying: false, currentTime: 0 });
      },
      play: (session) => {
        get().load(session);
        playbackElement().play().catch(failed);
      },
      toggle: () => {
        if (!get().session) return;
        const audio = playbackElement();
        if (audio.paused) audio.play().catch(failed);
        else audio.pause();
      },
      seek: (seconds) => {
        const audio = playbackElement();
        const end = Number.isFinite(audio.duration) ? audio.duration : (get().session?.duration ?? 0);
        const next = Math.max(0, Math.min(seconds, end));
        audio.currentTime = next;
        set({ currentTime: next });
      },
      skip: (seconds) => get().seek(playbackElement().currentTime + seconds),
      stop: () => {
        const audio = playbackElement();
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
        set({ session: null, isPlaying: false, currentTime: 0 });
      },
      viewShown: () => set((s) => ({ viewsOnScreen: s.viewsOnScreen + 1 })),
      viewHidden: () => set((s) => ({ viewsOnScreen: s.viewsOnScreen - 1 })),
    }),
    {
      name: 'roci-audio-player',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        playbackRate: state.playbackRate,
        volume: state.volume,
        isMuted: state.isMuted,
      }),
    },
  ),
);
