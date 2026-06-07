import { useQuery } from '@tanstack/react-query';
import { recordingsService } from '@services/storage';
import { queryKeys } from '@shared/query/queryKeys';

interface AudioQueryResult {
  audioUrl: string | null;
  duration: number;
  isLoading: boolean;
  error: string | null;
}

export function useAudioQuery(recordingFileName: string): AudioQueryResult {
  const {
    data,
    isLoading,
    error,
  } = useQuery({
    queryKey: queryKeys.recordingAudio(recordingFileName),
    queryFn: async () => {
      const [metaResult, dataResult] = await Promise.all([
        recordingsService.getRecordingMetadata(recordingFileName),
        recordingsService.getRecordingData(recordingFileName),
      ]);

      const duration = metaResult.success && metaResult.data ? metaResult.data.duration || 0 : 0;

      if (dataResult.success && dataResult.data) {
        const blob = new Blob([dataResult.data], { type: 'audio/wav' });
        const audioUrl = URL.createObjectURL(blob);
        return { audioUrl, duration };
      }

      throw new Error('Could not load audio file');
    },
    staleTime: Infinity,
    gcTime: 1000 * 60 * 30,
    enabled: !!recordingFileName,
  });

  return {
    audioUrl: data?.audioUrl ?? null,
    duration: data?.duration ?? 0,
    isLoading,
    error: error ? (error instanceof Error ? error.message : 'Failed to load audio') : null,
  };
}
