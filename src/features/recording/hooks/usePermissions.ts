import { useQuery } from '@tanstack/react-query';
import { permissionsService } from '@services/permissions.service';
import { queryKeys } from '@shared/query/queryKeys';
import { AUDIO_CONFIG } from '@config/audio.config';

/** Live permission rows; polls only while `enabled` so a grant flips its row. */
export function usePermissions(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.permissions(),
    queryFn: () => permissionsService.getPermissions(),
    enabled,
    refetchInterval: enabled ? AUDIO_CONFIG.permissions.pollIntervalMs : false,
  });
}
