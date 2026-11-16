import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { permissionsService, PERMISSIONS_CHANGED_EVENT, type PermissionKind } from '@services/permissions.service';
import { queryKeys } from '@shared/query/queryKeys';
import { useTauriEvent } from '@shared/hooks';

/** Permission rows while `enabled`; re-read when a prompt is answered and whenever Roci regains focus (back from System Settings). */
export function usePermissions(enabled: boolean) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.permissions(),
    queryFn: () => permissionsService.getPermissions(),
    enabled,
    refetchOnWindowFocus: 'always',
  });

  // macOS answers the prompt after `request` returns; its answer arrives as this event.
  useTauriEvent(PERMISSIONS_CHANGED_EVENT, () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.permissions() }).catch((error: unknown) =>
      console.error('[usePermissions] refresh failed:', error));
  });

  const request = useCallback((kind: PermissionKind) => permissionsService.request(kind), []);

  return { ...query, request };
}
