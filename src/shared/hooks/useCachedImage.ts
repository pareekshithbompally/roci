/** A remote image as a cached `data:` source: loaded once per URL for the session and from disk after, never retried on remount. */

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@shared/query/queryKeys';
import { cachedImage } from '@services/imageCache';

export function useCachedImage(url: string | null | undefined): { src: string | null; failed: boolean } {
  const { data, isError } = useQuery({
    queryKey: queryKeys.cachedImage(url ?? ''),
    queryFn: () => cachedImage(url as string),
    enabled: !!url,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
    retryOnMount: false,
  });
  return { src: data ?? null, failed: isError };
}
