import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Square } from 'lucide-react';
import { formatTime } from '../utils/audioUtils';
import { UI_CONFIG } from '../src/config/ui.config';
import { SURFACE, BORDER, TEXT, COMPONENT } from '../src/config/theme.config';

interface CustomAudioPlayerProps {
  src: string;
  duration: number; // Duration in seconds passed from the recorder state
}

const CustomAudioPlayer: React.FC<CustomAudioPlayerProps> = ({ src, duration }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  // Sync play/pause with audio element
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.play().catch((e) => {
        console.warn("Playback failed", e);
        setIsPlaying(false);
      });
    } else {
      audio.pause();
    }
  }, [isPlaying]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      // Optional: don't auto-reset current time to 0 to mimic some native players, 
      // or reset it. Let's keep it at the end to show it finished.
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
    };
  }, []);

  const togglePlay = () => setIsPlaying(!isPlaying);

  const handleStop = () => {
    setIsPlaying(false);
    setCurrentTime(0);
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  return (
    <div 
      className={`flex items-center gap-3 w-full ${SURFACE.subtle} p-3 rounded-xl border ${BORDER.default} shadow-sm`}
      role="region"
      aria-label="Audio player"
    >
      <button 
        onClick={togglePlay}
        className={`w-10 h-10 flex items-center justify-center rounded-full ${COMPONENT.primaryButton} transition-all shrink-0 shadow-sm focus:outline-none focus:ring-2 focus:ring-zinc-300 focus:ring-offset-2`}
        aria-label={isPlaying ? 'Pause' : 'Play'}
        style={{ 
          width: UI_CONFIG.audioPlayer.buttonSize, 
          height: UI_CONFIG.audioPlayer.buttonSize 
        }}
      >
        {isPlaying ? (
          <Pause className="w-4 h-4 fill-current" aria-hidden="true" />
        ) : (
          <Play className="w-4 h-4 fill-current ml-0.5" aria-hidden="true" />
        )}
      </button>

      <button
        onClick={handleStop}
        className={`w-8 h-8 flex items-center justify-center rounded-full ${COMPONENT.secondaryButton} shrink-0 focus:outline-none focus:ring-2 focus:ring-zinc-300 focus:ring-offset-1`}
        aria-label="Stop and reset"
      >
        <Square className="w-3 h-3 fill-current" aria-hidden="true" />
      </button>

      <span
        className={`text-xs font-mono ${TEXT.muted} text-right tabular-nums select-none`}
        style={{ width: UI_CONFIG.audioPlayer.timeWidth }}
        aria-label={`Current time: ${formatTime(currentTime)}`}
      >
        {formatTime(currentTime)}
      </span>

      <div 
        className="relative flex-1 flex items-center group"
        style={{ height: UI_CONFIG.audioPlayer.sliderHeight }}
      >
        <input
          type="range"
          min={0}
          max={duration || 1}
          step={0.1}
          value={currentTime}
          onChange={handleSeek}
          className="w-full h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-zinc-900 dark:accent-zinc-200 hover:accent-zinc-700 transition-all focus:outline-none focus:ring-2 focus:ring-zinc-300"
          aria-label="Seek audio position"
          aria-valuemin={0}
          aria-valuemax={duration}
          aria-valuenow={currentTime}
          aria-valuetext={`${formatTime(currentTime)} of ${formatTime(duration)}`}
        />
      </div>

      <span 
        className={`text-xs font-mono ${TEXT.muted} tabular-nums select-none`}
        style={{ width: UI_CONFIG.audioPlayer.timeWidth }}
        aria-label={`Total duration: ${formatTime(duration)}`}
      >
        {formatTime(duration)}
      </span>
      
      <audio ref={audioRef} src={src} preload="metadata" aria-hidden="true" />
    </div>
  );
};

export default CustomAudioPlayer;
