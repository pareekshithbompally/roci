import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@shared/ui', () => ({ showToast: vi.fn() }));

import { playbackElement, useAudioPlayerStore } from '@shared/stores/audioPlayerStore';

const session = (id: string) => ({ id, src: `blob:${id}`, title: id, duration: 0 });

describe('the one playback element', () => {
  beforeEach(() => useAudioPlayerStore.getState().stop());

  it('seeks before the audio has loaded to where it was asked, not back to the start', () => {
    const { load, seek } = useAudioPlayerStore.getState();
    load(session('m1'));
    seek(42);
    expect(useAudioPlayerStore.getState().currentTime).toBe(42);
    expect(playbackElement().currentTime).toBe(42);
  });

  it('unmutes when the volume is raised from silence', () => {
    const { setVolume } = useAudioPlayerStore.getState();
    setVolume(0);
    expect(useAudioPlayerStore.getState().isMuted).toBe(true);
    setVolume(0.4);
    expect(useAudioPlayerStore.getState()).toMatchObject({ volume: 0.4, isMuted: false });
  });

  it('releases only the deleted meeting’s audio', () => {
    const { load, release } = useAudioPlayerStore.getState();
    load(session('m1'));
    release('other');
    expect(useAudioPlayerStore.getState().session?.id).toBe('m1');
    release('m1');
    expect(useAudioPlayerStore.getState().session).toBeNull();
  });
});
