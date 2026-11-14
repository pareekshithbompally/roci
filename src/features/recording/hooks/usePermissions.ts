import { useQuery } from '@tanstack/react-query';
import { permissionsService } from '@services/permissions.service';
import { queryKeys } from '@shared/query/queryKeys';
import { PERMISSIONS_CONFIG } from '@config/permissions.config';

/** Live permission rows; polls only while `enabled` so a grant flips its row. */
export function usePermissions(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.permissions(),
    queryFn: () => permissionsService.getPermissions(),
    enabled,
    refetchInterval: enabled ? PERMISSIONS_CONFIG.pollIntervalMs : false,
  });
}
