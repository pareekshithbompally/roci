/**
 * ResultsAudioPlayer Component
 *
 * Loads a recording's audio data from storage and renders the CustomAudioPlayer.
 * Shown in ResultsView above the tab content.
 */

import React, { useState, useEffect } from 'react';
import { recordingsService } from '@services/storage';
import CustomAudioPlayer from '@shared/components/CustomAudioPlayer';
import { SURFACE } from '@config/theme.config';

interface ResultsAudioPlayerProps {
  recordingFileName: string;
}

export const ResultsAudioPlayer: React.FC<ResultsAudioPlayerProps> = ({ recordingFileName }) => {
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let blobUrl: string | null = null;

    const loadAudio = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Load metadata for duration
        const metaResult = await recordingsService.getRecordingMetadata(recordingFileName);
        if (metaResult.success && metaResult.data) {
          setDuration(metaResult.data.duration || 0);
        }

        // Load audio data
        const dataResult = await recordingsService.getRecordingData(recordingFileName);
        if (dataResult.success && dataResult.data) {
          const blob = new Blob([dataResult.data], { type: 'audio/wav' });
          blobUrl = URL.createObjectURL(blob);
          setAudioUrl(blobUrl);
        } else {
          setError('Could not load audio file');
        }
      } catch (err) {
        console.error('[ResultsAudioPlayer] Error loading audio:', err);
        setError('Failed to load audio');
      } finally {
        setIsLoading(false);
      }
    };

    loadAudio();

    return () => {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [recordingFileName]);

  if (isLoading) {
    return (
      <div className="px-12 py-2">
        <div className={`h-12 ${SURFACE.skeleton} rounded-xl animate-pulse`} />
      </div>
    );
  }

  if (error || !audioUrl) {
    return null;
  }

  return (
    <div className="px-12 py-2">
      <CustomAudioPlayer src={audioUrl} duration={duration} />
    </div>
  );
};

export default ResultsAudioPlayer;
