/** Any audio as a waveform player: a meeting's recording, a chat's audio. Every player drives the one playback element
 *  (`audioPlayerStore`); the loaded session's player draws its waveform on that element, any other draws its own and takes
 *  the element over on play, skip or a click on the waveform. */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play, SkipBack, SkipForward, Volume1, Volume2, VolumeX } from 'lucide-react';
import { useWavesurfer } from '@wavesurfer/react';
import Hover from 'wavesurfer.js/dist/plugins/hover.esm.js';
import { formatClock } from '@shared/utils/formatters';
import { useThemeContext } from '@shared/contexts/ThemeContext';
import { playbackElement, useAudioPlayerStore, type PlaybackSession } from '@shared/stores/audioPlayerStore';
import { cssToken } from '@shared/utils/cssToken';
import { PLAYER_CONFIG } from '@config/player.config';
import { Button, Icon, IconButton, Popover, PopoverAnchor, PopoverContent, Slider, Surface, Text } from '@shared/ui';
import { Menu } from './Menu';

const { skipSeconds, seekSeconds, volumeStep, speeds, waveform } = PLAYER_CONFIG;

/** WaveSurfer takes colour strings: the token roles, re-read when the theme flips. */
function useWaveColors() {
  const { isDark } = useThemeContext();
  return useMemo(
    () => ({
      waveColor: cssToken('--bg-layer-4'),
      progressColor: cssToken('--text-primary'),
      labelBackground: cssToken('--bg-inverse'),
      labelColor: cssToken('--text-inverse'),
    }),
    [isDark],
  );
}

/** Playback for this player's session: the engine's state when the session is loaded, else at rest. Any control loads
 *  the session first, so pressing it takes the element over. */
function usePlayback(session: PlaybackSession) {
  const isOwner = useAudioPlayerStore((s) => s.session?.id === session.id);
  // The file the playback element holds: the owner draws on exactly that, never a newer URL for the same audio.
  const loadedSrc = useAudioPlayerStore((s) => s.session?.src);
  const enginePlaying = useAudioPlayerStore((s) => s.isPlaying);
  const engineTime = useAudioPlayerStore((s) => s.currentTime);
  const load = useAudioPlayerStore((s) => s.load);
  const play = useAudioPlayerStore((s) => s.play);
  const toggle = useAudioPlayerStore((s) => s.toggle);
  const seek = useAudioPlayerStore((s) => s.seek);
  const skip = useAudioPlayerStore((s) => s.skip);
  const viewShown = useAudioPlayerStore((s) => s.viewShown);
  const viewHidden = useAudioPlayerStore((s) => s.viewHidden);

  // While on screen, the loaded session's player stands in for the minimized one.
  useEffect(() => {
    if (!isOwner) return;
    viewShown();
    return viewHidden;
  }, [isOwner, viewShown, viewHidden]);

  // The session prop may be a fresh object each render: the callbacks read the latest one, so they stay stable.
  const latest = useRef(session);
  latest.current = session;
  const togglePlay = useCallback(() => (isOwner ? toggle() : play(latest.current)), [isOwner, toggle, play]);
  const skipBy = useCallback((seconds: number) => {
    load(latest.current);
    skip(seconds);
  }, [load, skip]);
  const seekTo = useCallback((seconds: number) => {
    load(latest.current);
    seek(seconds);
  }, [load, seek]);

  return {
    isOwner,
    src: isOwner && loadedSrc ? loadedSrc : session.src,
    isPlaying: isOwner && enginePlaying,
    currentTime: isOwner ? engineTime : 0,
    togglePlay,
    skipBy,
    seekTo,
  };
}

type Playback = ReturnType<typeof usePlayback>;

/** Space plays or pauses, arrows seek and set the volume, while focus is inside the player. */
function usePlayerKeys(playerRef: React.RefObject<HTMLDivElement | null>, { togglePlay, skipBy }: Pick<Playback, 'togglePlay' | 'skipBy'>) {
  const setVolume = useAudioPlayerStore((s) => s.setVolume);
  useEffect(() => {
    const volumeBy = (step: number) => setVolume(Math.min(Math.max(useAudioPlayerStore.getState().volume + step, 0), 1));
    const keys: Record<string, () => void> = {
      Space: togglePlay,
      ArrowLeft: () => skipBy(-seekSeconds),
      ArrowRight: () => skipBy(seekSeconds),
      ArrowUp: () => volumeBy(volumeStep),
      ArrowDown: () => volumeBy(-volumeStep),
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (!playerRef.current?.contains(document.activeElement)) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const action = keys[e.code];
      if (!action) return;
      e.preventDefault();
      action();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [playerRef, togglePlay, skipBy, setVolume]);
}

function VolumeControl() {
  const volume = useAudioPlayerStore((s) => s.volume);
  const isMuted = useAudioPlayerStore((s) => s.isMuted);
  const setVolume = useAudioPlayerStore((s) => s.setVolume);
  const toggleMute = useAudioPlayerStore((s) => s.toggleMute);
  const [open, setOpen] = useState(false);
  const level = isMuted ? 0 : volume;
  const VolumeIcon = level === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div className="flex items-center" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
          <IconButton icon={VolumeIcon} size="sm" onClick={toggleMute} label={isMuted ? 'Unmute' : 'Mute'} />
          <PopoverContent side="top" sideOffset={8} width="auto" className="p-2" onOpenAutoFocus={(e) => e.preventDefault()}>
            <Slider
              orientation="vertical"
              min={0}
              max={1}
              step={0.01}
              value={level}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              aria-label="Volume"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(level * 100)}
            />
          </PopoverContent>
        </div>
      </PopoverAnchor>
    </Popover>
  );
}

function SpeedMenu() {
  const playbackRate = useAudioPlayerStore((s) => s.playbackRate);
  const setPlaybackRate = useAudioPlayerStore((s) => s.setPlaybackRate);
  return (
    <Menu
      label="Playback speed"
      align="start"
      trigger={(
        <Button variant="ghost" size="sm" aria-label={`Playback speed ${playbackRate}x`}>
          <Text variant="figureSmall" tone="inherit">{playbackRate}x</Text>
        </Button>
      )}
      items={speeds.map((speed) => ({ type: 'check' as const, label: `${speed}×`, checked: playbackRate === speed, onSelect: () => setPlaybackRate(speed) }))}
    />
  );
}

export const AudioPlayer: React.FC<{ session: PlaybackSession }> = ({ session }) => {
  const playerRef = useRef<HTMLDivElement>(null);
  const waveformRef = useRef<HTMLDivElement>(null);
  const colors = useWaveColors();
  const playback = usePlayback(session);
  const [showRemaining, setShowRemaining] = useState(false);

  const hover = useMemo(
    () => Hover.create({ lineColor: 'transparent', lineWidth: 0, labelBackground: colors.labelBackground, labelColor: colors.labelColor, labelSize: waveform.labelSize }),
    [colors],
  );
  const plugins = useMemo(() => [hover], [hover]);

  // The bars already drawn: the waveform is rebuilt when playback moves to or from this player, and redraws them instead of
  // reading and decoding the whole file again. Read once per handover, so taking them never rebuilds it on its own.
  const drawn = useRef<{ peaks: number[][]; duration: number } | null>(null);
  const handover = useMemo(() => drawn.current, [playback.isOwner]);

  const { wavesurfer } = useWavesurfer({
    container: waveformRef,
    url: playback.src,
    ...(handover && { peaks: handover.peaks, duration: handover.duration }),
    // The loaded session draws on the playback element; another player's waveform has its own, never played.
    media: playback.isOwner ? playbackElement() : undefined,
    height: 'auto',
    waveColor: colors.waveColor,
    progressColor: colors.progressColor,
    barWidth: waveform.barWidth,
    barGap: waveform.barGap,
    barRadius: waveform.barRadius,
    barHeight: 1,
    normalize: true,
    cursorWidth: 0,
    cursorColor: 'transparent',
    // MediaElement backend: the WebAudio backend sets the page's audio session to `playback`, after which WebKit refuses
    // the microphone (dictation fails with "AudioSession category is not compatible").
    autoplay: false,
    plugins,
  });

  useEffect(() => {
    if (!wavesurfer) return;
    return wavesurfer.on('ready', () => {
      drawn.current = { peaks: wavesurfer.exportPeaks(), duration: wavesurfer.getDuration() };
    });
  }, [wavesurfer]);

  // A click on another player's waveform loads its session at that point.
  const { isOwner, seekTo } = playback;
  useEffect(() => {
    if (!wavesurfer || isOwner) return;
    return wavesurfer.on('interaction', (time) => seekTo(time));
  }, [wavesurfer, isOwner, seekTo]);

  usePlayerKeys(playerRef, playback);

  const duration = wavesurfer?.getDuration() || session.duration;
  const displayTime = showRemaining ? `-${formatClock(Math.max(duration - playback.currentTime, 0))}` : formatClock(playback.currentTime);

  return (
    <Surface ref={playerRef} tabIndex={0} variant="card" radius="lg" className="flex flex-col gap-2 w-full p-3 select-none" role="region" aria-label="Audio player">
      <div className="flex items-center gap-2">
        <IconButton icon={SkipBack} size="sm" onClick={() => playback.skipBy(-skipSeconds)} label={`Skip back ${skipSeconds} seconds`} />
        <Button variant="primary" size="icon" onClick={playback.togglePlay} aria-label={playback.isPlaying ? 'Pause' : 'Play'}>
          <Icon icon={playback.isPlaying ? Pause : Play} size="sm" className={playback.isPlaying ? 'fill-current' : 'fill-current ml-0.5'} />
        </Button>
        <IconButton icon={SkipForward} size="sm" onClick={() => playback.skipBy(skipSeconds)} label={`Skip forward ${skipSeconds} seconds`} />
        <Button
          variant="ghost"
          size="inline"
          onClick={() => setShowRemaining(!showRemaining)}
          className="min-w-16"
          aria-label={showRemaining ? 'Show elapsed time' : 'Show remaining time'}
        >
          <Text variant="figureSmall" tone="inherit">{displayTime}</Text>
        </Button>
        <div className="flex-1" />
        <VolumeControl />
        <SpeedMenu />
        <Text variant="figureSmall" tone="muted" className="min-w-16 text-right">{formatClock(duration)}</Text>
      </div>
      <Surface ref={waveformRef} radius="md" className="h-10 w-full overflow-hidden" />
    </Surface>
  );
};
