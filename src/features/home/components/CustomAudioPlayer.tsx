import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Volume1,
  Check,
} from 'lucide-react';
import { useWavesurfer } from '@wavesurfer/react';
import Hover from 'wavesurfer.js/dist/plugins/hover.esm.js';
import { formatTime } from '@shared/utils/audio.utils';
import { useThemeContext } from '@shared/contexts/ThemeContext';
import { useAudioPlayerStore, SPEED_OPTIONS } from '@shared/stores/audioPlayerStore';
import { cssToken } from '@shared/utils/cssToken';
import { PICKER } from '@config/layout.config';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Icon,
  IconButton,
  Popover,
  PopoverAnchor,
  PopoverContent,
  Slider,
  Surface,
  Text,
} from '@shared/ui';

interface CustomAudioPlayerProps {
  src: string;
  duration: number;
  /** If provided, only syncs to central store when this matches the active session's meetingId */
  meetingId?: string;
}

const SKIP_SECONDS = 15;
const SEEK_SMALL = 5;

const CustomAudioPlayer: React.FC<CustomAudioPlayerProps> = ({ src, duration, meetingId }) => {
  const playerRef = useRef<HTMLDivElement>(null);
  const waveformRef = useRef<HTMLDivElement>(null);
  const { isDark } = useThemeContext();

  const playbackRate = useAudioPlayerStore((s) => s.playbackRate);
  const volume = useAudioPlayerStore((s) => s.volume);
  const isMuted = useAudioPlayerStore((s) => s.isMuted);
  const setPlaybackRate = useAudioPlayerStore((s) => s.setPlaybackRate);
  const setVolume = useAudioPlayerStore((s) => s.setVolume);
  const toggleMute = useAudioPlayerStore((s) => s.toggleMute);
  const setPlaying = useAudioPlayerStore((s) => s.setPlaying);
  const updateCurrentTime = useAudioPlayerStore((s) => s.updateCurrentTime);
  const session = useAudioPlayerStore((s) => s.session);

  const isOwner = !meetingId || session?.meetingId === meetingId;

  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const [showRemaining, setShowRemaining] = useState(false);

  // WaveSurfer takes colour strings: read the token roles, re-read when the theme flips.
  const { waveColor, progressColor, primaryColor, invertedColor } = useMemo(
    () => ({
      waveColor: cssToken('--bg-layer-4'),
      progressColor: cssToken('--text-primary'),
      primaryColor: cssToken('--bg-inverse'),
      invertedColor: cssToken('--text-inverse'),
    }),
    [isDark],
  );

  const hoverPlugin = useMemo(
    () =>
      Hover.create({
        lineColor: 'transparent',
        lineWidth: 0,
        labelBackground: primaryColor,
        labelColor: invertedColor,
        labelSize: '10px',
      }),
    [primaryColor, invertedColor]
  );

  const { wavesurfer, isPlaying, currentTime } = useWavesurfer({
    container: waveformRef,
    url: src,
    height: 'auto',
    waveColor,
    progressColor,
    barWidth: 3,
    barGap: 2,
    barRadius: 2,
    barHeight: 1,
    normalize: true,
    cursorWidth: 0,
    cursorColor: 'transparent',
    backend: 'WebAudio',
    autoplay: false,
    plugins: useMemo(() => [hoverPlugin], []),
  });

  const effectiveDuration = wavesurfer ? wavesurfer.getDuration() : duration;

  // Seek to stored position when the session matches and audio is ready
  const storeCurrentTime = useAudioPlayerStore((s) => s.currentTime);
  useEffect(() => {
    if (!wavesurfer || !isOwner || storeCurrentTime <= 0) return;
    const onReady = () => {
      wavesurfer.setTime(storeCurrentTime);
    };
    if (wavesurfer.getDuration() > 0) {
      wavesurfer.setTime(storeCurrentTime);
    } else {
      wavesurfer.once('ready', onReady);
      return () => {
        wavesurfer.un('ready', onReady);
      };
    }
  }, [wavesurfer, isOwner, storeCurrentTime]);

  // Persist playback position on unmount (only when this player owns the session)
  useEffect(() => {
    if (!isOwner) return;
    return () => {
      if (wavesurfer) {
        const pos = wavesurfer.getCurrentTime();
        const wasPlaying = wavesurfer.isPlaying();
        wavesurfer.pause(); // Stop wavesurfer so AudioPlaybackRow doesn't double-play
        updateCurrentTime(pos);
        if (wasPlaying) setPlaying(true);
      }
    };
  }, [wavesurfer, updateCurrentTime, setPlaying, isOwner]);

  // Sync wavesurfer play/pause/time state to store (only when this player owns the session)
  useEffect(() => {
    if (!wavesurfer || !isOwner) return;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onTimeUpdate = () => updateCurrentTime(wavesurfer.getCurrentTime());
    const onFinish = () => setPlaying(false);

    wavesurfer.on('play', onPlay);
    wavesurfer.on('pause', onPause);
    wavesurfer.on('timeupdate', onTimeUpdate);
    wavesurfer.on('finish', onFinish);

    return () => {
      wavesurfer.un('play', onPlay);
      wavesurfer.un('pause', onPause);
      wavesurfer.un('timeupdate', onTimeUpdate);
      wavesurfer.un('finish', onFinish);
    };
  }, [wavesurfer, setPlaying, updateCurrentTime, isOwner]);

  useEffect(() => {
    wavesurfer?.setPlaybackRate(playbackRate);
  }, [playbackRate, wavesurfer]);

  useEffect(() => {
    wavesurfer?.setVolume(isMuted ? 0 : volume);
  }, [volume, isMuted, wavesurfer]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const player = playerRef.current;
      if (!player || !player.contains(document.activeElement)) return;

      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          wavesurfer?.playPause();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          wavesurfer?.skip(-SEEK_SMALL);
          break;
        case 'ArrowRight':
          e.preventDefault();
          wavesurfer?.skip(SEEK_SMALL);
          break;
        case 'ArrowUp':
          e.preventDefault();
          setVolume(Math.min(volume + 0.1, 1));
          break;
        case 'ArrowDown':
          e.preventDefault();
          setVolume(Math.max(volume - 0.1, 0));
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [wavesurfer, volume, setVolume]);

  const togglePlay = useCallback(() => {
    wavesurfer?.playPause();
  }, [wavesurfer]);

  const skipBackward = useCallback(() => {
    wavesurfer?.skip(-SKIP_SECONDS);
  }, [wavesurfer]);

  const skipForward = useCallback(() => {
    wavesurfer?.skip(SKIP_SECONDS);
  }, [wavesurfer]);

  const VolumeIcon = isMuted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  const displayTime = showRemaining
    ? `-${formatTime(Math.max(effectiveDuration - currentTime, 0))}`
    : formatTime(currentTime);

  return (
    <Surface
      ref={playerRef}
      tabIndex={0}
      variant="card"
      radius="lg"
      className="flex flex-col gap-2 w-full p-3 select-none"
      role="region"
      aria-label="Audio player"
    >
      <div className="flex items-center gap-2">
        <IconButton icon={SkipBack} size="sm" onClick={skipBackward} label={`Skip back ${SKIP_SECONDS} seconds`} />

        <Button variant="primary" size="icon" onClick={togglePlay} aria-label={isPlaying ? 'Pause' : 'Play'}>
          <Icon icon={isPlaying ? Pause : Play} size="sm" className={isPlaying ? 'fill-current' : 'fill-current ml-0.5'} />
        </Button>

        <IconButton icon={SkipForward} size="sm" onClick={skipForward} label={`Skip forward ${SKIP_SECONDS} seconds`} />

        <Button
          variant="ghost"
          size="inline"
          onClick={() => setShowRemaining(!showRemaining)}
          className="min-w-16"
          aria-label={showRemaining ? 'Show elapsed time' : 'Show remaining time'}
        >
          <Text variant="mono" tone="inherit" className="tabular-nums">{displayTime}</Text>
        </Button>

        <div className="flex-1" />

        <Popover open={showVolumeSlider} onOpenChange={setShowVolumeSlider}>
          <PopoverAnchor asChild>
            <div
              className="flex items-center"
              onMouseEnter={() => setShowVolumeSlider(true)}
              onMouseLeave={() => setShowVolumeSlider(false)}
            >
              <IconButton icon={VolumeIcon} size="sm" onClick={toggleMute} label={isMuted ? 'Unmute' : 'Mute'} />
              <PopoverContent side="top" sideOffset={8} width="auto" className="p-2" onOpenAutoFocus={(e) => e.preventDefault()}>
                <Slider
                  orientation="vertical"
                  min={0}
                  max={1}
                  step={0.01}
                  value={isMuted ? 0 : volume}
                  onChange={(e) => setVolume(parseFloat(e.target.value))}
                  aria-label="Volume"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round((isMuted ? 0 : volume) * 100)}
                />
              </PopoverContent>
            </div>
          </PopoverAnchor>
        </Popover>

        <DropdownMenu open={showSpeedMenu} onOpenChange={setShowSpeedMenu}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" aria-label={`Playback speed ${playbackRate}x`}>
              <Text variant="mono" tone="inherit">{playbackRate}x</Text>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="center">
            {SPEED_OPTIONS.map((speed) => (
              <DropdownMenuItem key={speed} onSelect={() => setPlaybackRate(speed)}>
                <Text variant="mono" tone="inherit" className="flex-1">{speed}x</Text>
                <span className={PICKER.checkSlot}>
                  {playbackRate === speed && <Icon icon={Check} size="xs" />}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Text variant="mono" tone="muted" className="tabular-nums min-w-16 text-right">
          {formatTime(effectiveDuration)}
        </Text>
      </div>

      <Surface ref={waveformRef} radius="md" className="h-10 w-full overflow-hidden" />
    </Surface>
  );
};

export default CustomAudioPlayer;
