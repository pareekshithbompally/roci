/** Meeting audio playing away from its meeting: title, stop, play/pause, skip, a seek slider and the time. */

import React from 'react';
import { Pause, Play, SkipForward, Square } from 'lucide-react';
import { Dot, IconButton, Slider, Text } from '@shared/ui';
import { formatTime } from '@shared/utils/audio.utils';
import { SKIP_SECONDS, type MinimizedAudio } from './useMinimizedAudio';

export const AudioRow: React.FC<{ audio: MinimizedAudio }> = ({ audio }) => (
  <div className="space-y-1 px-3 py-2">
    <div className="flex items-center gap-2.5">
      <span className="flex w-4 shrink-0 justify-center"><Dot tone="success" pulse={audio.isPlaying} /></span>
      <Text as="p" variant="label" truncate className="flex-1">{audio.title}</Text>
      <IconButton icon={Square} filled label="Stop playback" size="sm" onClick={audio.stop} />
    </div>
    <div className="flex items-center gap-1">
      <IconButton icon={audio.isPlaying ? Pause : Play} filled label={audio.isPlaying ? 'Pause' : 'Play'} size="sm" onClick={audio.toggle} />
      <IconButton icon={SkipForward} label={`Skip forward ${SKIP_SECONDS} seconds`} size="sm" onClick={audio.skip} />
      <Slider
        aria-label="Seek"
        min={0}
        max={audio.duration || 0}
        step="any"
        value={Math.min(audio.currentTime, audio.duration || 0)}
        onChange={(e) => audio.seek(Number(e.target.value))}
        className="flex-1"
      />
      <Text variant="caption" tone="muted" className="shrink-0">
        {formatTime(audio.currentTime)} / {formatTime(audio.duration)}
      </Text>
    </div>
  </div>
);
