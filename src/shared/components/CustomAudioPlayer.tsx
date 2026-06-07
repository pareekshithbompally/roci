import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Volume1,
} from 'lucide-react';
import { useWavesurfer } from '@wavesurfer/react';
import Hover from 'wavesurfer.js/dist/plugins/hover.esm.js';
import { formatTime } from '@shared/utils/audio.utils';
import { useThemeContext } from '@shared/contexts/ThemeContext';
import { useAudioPlayerStore, SPEED_OPTIONS } from '@shared/stores/audioPlayerStore';
import { UI_CONFIG } from '@config/ui.config';
import { AUDIO } from '@config/theme.config';

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

  const waveformTokens = UI_CONFIG.colors.waveform;
  const waveColor = isDark ? waveformTokens.unplayed.dark : waveformTokens.unplayed.light;
  const progressColor = isDark ? waveformTokens.played.dark : waveformTokens.played.light;

  const primaryColor = isDark
    ? UI_CONFIG.colors.primary.dark
    : UI_CONFIG.colors.primary.light;
  const invertedColor = isDark
    ? UI_CONFIG.colors.primary.light
    : UI_CONFIG.colors.primary.dark;

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
    <div
      ref={playerRef}
      tabIndex={0}
      className={`flex flex-col gap-2 w-full ${AUDIO.shell} p-3 ${AUDIO.focusRing}`}
      role="region"
      aria-label="Audio player"
    >
      <div className="flex items-center gap-2">
        <button
          onClick={skipBackward}
          className={AUDIO.controlButton}
          aria-label={`Skip back ${SKIP_SECONDS} seconds`}
          title={`Skip back ${SKIP_SECONDS}s`}
        >
          <SkipBack className="w-4 h-4" />
        </button>

        <button
          onClick={togglePlay}
          className={AUDIO.playButton}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? (
            <Pause className="w-4 h-4 fill-current" />
          ) : (
            <Play className="w-4 h-4 fill-current ml-0.5" />
          )}
        </button>

        <button
          onClick={skipForward}
          className={AUDIO.controlButton}
          aria-label={`Skip forward ${SKIP_SECONDS} seconds`}
          title={`Skip forward ${SKIP_SECONDS}s`}
        >
          <SkipForward className="w-4 h-4" />
        </button>

        <button
          onClick={() => setShowRemaining(!showRemaining)}
          className={AUDIO.timeLabelInteractive}
          aria-label={showRemaining ? 'Show elapsed time' : 'Show remaining time'}
        >
          {displayTime}
        </button>

        <div className="flex-1" />

        <div
          className="relative flex items-center"
          onMouseEnter={() => setShowVolumeSlider(true)}
          onMouseLeave={() => setShowVolumeSlider(false)}
        >
          <button
            onClick={toggleMute}
            className={AUDIO.controlButton}
            aria-label={isMuted ? 'Unmute' : 'Mute'}
          >
            <VolumeIcon className="w-4 h-4" />
          </button>

          <div
            className={`absolute bottom-full left-1/2 -translate-x-1/2 mb-2 p-2 rounded-lg ${AUDIO.popover} transition-all duration-150 origin-bottom ${
              showVolumeSlider
                ? 'opacity-100 scale-100'
                : 'opacity-0 scale-95 pointer-events-none'
            }`}
          >
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={isMuted ? 0 : volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              className={AUDIO.volumeSlider}
              style={{
                accentColor: isDark
                  ? UI_CONFIG.colors.primary.dark
                  : UI_CONFIG.colors.primary.light,
              }}
              aria-label="Volume"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round((isMuted ? 0 : volume) * 100)}
            />
          </div>
        </div>

        <div className="relative">
          <button
            onClick={() => setShowSpeedMenu(!showSpeedMenu)}
            onBlur={() => setTimeout(() => setShowSpeedMenu(false), 150)}
            className={AUDIO.speedTrigger}
            aria-label={`Playback speed ${playbackRate}x`}
          >
            {playbackRate}x
          </button>

          {showSpeedMenu && (
            <div
              className={`absolute bottom-full left-1/2 -translate-x-1/2 mb-2 p-1 rounded-lg ${AUDIO.popover} z-20`}
            >
              {SPEED_OPTIONS.map((speed) => (
                <button
                  key={speed}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setPlaybackRate(speed);
                    setShowSpeedMenu(false);
                  }}
                  className={`${AUDIO.popoverItem} ${
                    playbackRate === speed
                      ? AUDIO.popoverItemSelected
                      : AUDIO.popoverItemDefault
                  }`}
                >
                  {speed}x
                </button>
              ))}
            </div>
          )}
        </div>

        <span className={AUDIO.timeLabelDuration}>
          {formatTime(effectiveDuration)}
        </span>
      </div>

      <div ref={waveformRef} className={AUDIO.waveform} />
    </div>
  );
};

export default CustomAudioPlayer;
