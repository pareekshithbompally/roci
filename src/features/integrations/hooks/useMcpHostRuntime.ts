/** Mount once (App): answers coding agents' tool calls and keeps the Integrations status fresh. */

import { useEffect } from 'react';
import { isTauriEnvironment } from '@services/tauri';
import { platform } from '@platform/index';
import { mcpHostService } from '@services/mcpHost.service';
import { serveTools } from '@extensions/tools/mcp-host';
import { queryClient } from '@shared/query/queryClient';
import { queryKeys } from '@shared/query/queryKeys';
import { failureLogger } from '@shared/utils/errors';

export function useMcpHostRuntime(): void {
  useEffect(() => {
    if (!platform.hasCodingAgents || !isTauriEnvironment()) return;
    const stops: Array<() => void> = [];
    let cancelled = false;
    const keep = (stop: () => void) => (cancelled ? stop() : stops.push(stop));
    const report = failureLogger('useMcpHostRuntime');

    serveTools().then(keep).catch(report('serve tools'));
    mcpHostService
      .onStatus(() => { void queryClient.invalidateQueries({ queryKey: queryKeys.mcpHost() }); })
      .then(keep)
      .catch(report('watch status'));

    return () => {
      cancelled = true;
      stops.forEach((stop) => stop());
    };
  }, []);
}
