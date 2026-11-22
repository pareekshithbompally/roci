import React from 'react';
import { AudioPlayer } from '@shared/components';
import { useAudioQuery } from '@features/home/hooks/useAudioQuery';
import { LAYOUT } from '@config/layout.config';

interface ResultsAudioPlayerProps {
  recordingFileName: string;
  meetingId: string;
  title: string;
}

/** The meeting's recording; pressing play takes the playback element over from whatever played before. */
export const ResultsAudioPlayer: React.FC<ResultsAudioPlayerProps> = ({ recordingFileName, meetingId, title }) => {
  const { audioUrl, duration, isLoading, error } = useAudioQuery(recordingFileName);

  // No skeleton or entrance of its own: it appears in place with the page, so nothing below it jumps twice.
  if (isLoading || error || !audioUrl) return null;

  return (
    <div className={`${LAYOUT.pageGutter} py-2`}>
      <div className={LAYOUT.pageColumn}>
        <AudioPlayer session={{ id: meetingId, src: audioUrl, title, duration }} />
      </div>
    </div>
  );
};

export default ResultsAudioPlayer;
