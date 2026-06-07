import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

export interface PlaybackSession {
  src: string;
  meetingId: string;
  title: string;
  duration: number;
}

type AudioPlayerStoreState = {
  playbackRate: number;
  volume: number;
  isMuted: boolean;
  /** Active playback session — set when audio loads for a meeting, cleared on stop/ended */
  session: PlaybackSession | null;
  /** Whether audio is currently playing */
  isPlaying: boolean;
  /** Current playback position in seconds */
  currentTime: number;

  setPlaybackRate: (rate: number) => void;
  setVolume: (volume: number) => void;
  setIsMuted: (muted: boolean) => void;
  toggleMute: () => void;

  /** Start or resume a playback session. If same meetingId, preserves currentTime. */
  startSession: (session: PlaybackSession) => void;
  updateCurrentTime: (time: number) => void;
  setPlaying: (playing: boolean) => void;
  stopSession: () => void;
};

export const useAudioPlayerStore = create<AudioPlayerStoreState>()(
  persist(
    (set, get) => ({
      playbackRate: 1,
      volume: 1,
      isMuted: false,
      session: null,
      isPlaying: false,
      currentTime: 0,

      setPlaybackRate: (rate) => set({ playbackRate: rate }),
      setVolume: (volume) => set({ volume, isMuted: volume === 0 ? true : get().isMuted }),
      setIsMuted: (muted) => set({ isMuted: muted }),
      toggleMute: () => set((s) => ({ isMuted: !s.isMuted })),

      startSession: (session) => {
        const current = get().session;
        // Same meeting? Just refresh src/duration, preserve playback position
        if (current && current.meetingId === session.meetingId) {
          set({
            session: { ...session, meetingId: current.meetingId, title: current.title },
          });
        } else {
          set({ session, isPlaying: false, currentTime: 0 });
        }
      },
      updateCurrentTime: (time) => set({ currentTime: time }),
      setPlaying: (playing) => set({ isPlaying: playing }),
      stopSession: () =>
        set({ session: null, isPlaying: false, currentTime: 0 }),
    }),
    {
      name: 'kasset-ai-audio-player',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        playbackRate: state.playbackRate,
        volume: state.volume,
        isMuted: state.isMuted,
      }),
    }
  )
);
