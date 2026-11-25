/** The Mac's on-device engine (llama-server): whether it runs with settings other than the current ones, and the
 *  restart that applies them. */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@shared/query/queryKeys';
import { onDeviceRestartPending, restartOnDeviceServer } from '@services/onDevice.service';
import { isTauriEnvironment } from '@services/tauri';
import { failureLogger } from '@shared/utils/errors';
import { platform } from '@platform/index';

const report = failureLogger('useOnDeviceRestart');

export interface OnDeviceRestart {
  /** A restart would apply changed settings. */
  pending: boolean;
  restarting: boolean;
  restart: () => void;
}

export function useOnDeviceRestart(): OnDeviceRestart {
  const client = useQueryClient();
  const key = queryKeys.onDeviceRestart();
  const { data: pending = false } = useQuery({
    queryKey: key,
    queryFn: onDeviceRestartPending,
    enabled: platform.servesOnDeviceModels && isTauriEnvironment(),
  });
  const mutation = useMutation({
    mutationFn: restartOnDeviceServer,
    onMutate: async () => {
      await client.cancelQueries({ queryKey: key });
      const previous = client.getQueryData<boolean>(key);
      client.setQueryData(key, false);
      return { previous };
    },
    onError: (error: unknown, _vars, context) => {
      client.setQueryData(key, context?.previous);
      report('restart')(error);
    },
    onSettled: () => client.invalidateQueries({ queryKey: key }),
  });
  return { pending, restarting: mutation.isPending, restart: () => mutation.mutate() };
}
