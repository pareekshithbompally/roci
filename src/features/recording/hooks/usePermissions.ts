import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { permissionsService, type PermissionKind } from '@services/permissions.service';
import { queryKeys } from '@shared/query/queryKeys';

/** Permission rows while `enabled`; re-read after a request and whenever Roci regains focus (back from System Settings). */
export function usePermissions(enabled: boolean) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.permissions(),
    queryFn: () => permissionsService.getPermissions(),
    enabled,
    refetchOnWindowFocus: 'always',
  });

  const request = useCallback(async (kind: PermissionKind) => {
    await permissionsService.request(kind);
    await queryClient.invalidateQueries({ queryKey: queryKeys.permissions() });
  }, [queryClient]);

  return { ...query, request };
}
