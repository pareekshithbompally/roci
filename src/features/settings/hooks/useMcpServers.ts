/** MCP config and connections as queries; a server that fails to connect is saved disabled and reported. */

import { useCallback, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { mcpService } from '@services/mcp.service';
import { isTauriEnvironment } from '@services/tauri';
import { queryKeys } from '@shared/query/queryKeys';
import { MCP_CONFIG } from '@config/mcp.config';
import type { McpConfig } from '@config/mcp.config';
import { errorMessage } from '@shared/utils/errors';
import { useThemeContext } from '@shared/contexts/ThemeContext';
import type { McpServerInfo } from '@services/mcp.service';

export function useMcpConfig() {
  return useQuery({
    queryKey: queryKeys.mcpConfig(),
    queryFn: () => mcpService.getConfig(),
    enabled: isTauriEnvironment(),
  });
}

export function useMcpConnectedServers() {
  return useQuery({
    queryKey: queryKeys.mcpConnected(),
    queryFn: () => mcpService.getConnectedServers(),
    enabled: isTauriEnvironment(),
  });
}

/** Tools offered by connected servers (composer Tools picker). */
export function useMcpTools() {
  return useQuery({
    queryKey: queryKeys.mcpTools(),
    queryFn: () => mcpService.getTools(),
    enabled: isTauriEnvironment(),
  });
}

/** Connected servers' title/icon by server name (picker, settings cards, chat); `icon` is the one for the current theme. */
export function useMcpServerInfo() {
  const { isDark } = useThemeContext();
  const forTheme = useCallback(
    (servers: McpServerInfo[]) =>
      new Map(servers.map((info) => [info.name, { ...info, icon: (isDark && info.iconDark) || info.icon }])),
    [isDark],
  );
  return useQuery({
    queryKey: queryKeys.mcpServerInfo(),
    queryFn: () => mcpService.getServerInfo(),
    select: forTheme,
    enabled: isTauriEnvironment(),
  });
}

/** Refresh connection status and tools whenever Rust reports a server change. */
export function useMcpUpdateListener() {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!isTauriEnvironment()) return;
    let unlisten: UnlistenFn | undefined;
    let disposed = false;
    listen(MCP_CONFIG.updateEvent, () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.mcpConnected() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.mcpTools() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.mcpServerInfo() });
    })
      .then((fn) => (disposed ? fn() : (unlisten = fn)))
      .catch((error: unknown) => console.error('[useMcpUpdateListener] listen failed:', error));
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [queryClient]);
}

export interface McpReconfigureVars {
  next: McpConfig;
  /** Servers whose connection must follow `next` (added, edited, toggled, removed). */
  affected: string[];
}

async function disconnect(names: string[]): Promise<void> {
  const connected = new Set(await mcpService.getConnectedServers());
  for (const name of names) {
    if (connected.has(name)) await mcpService.deactivate(name);
  }
}

/** Connect enabled servers; a failure is saved as disabled and reported. */
async function connect(next: McpConfig, names: string[]): Promise<{ saved: McpConfig; failures: string[] }> {
  const mcpServers = { ...next.mcpServers };
  const failures: string[] = [];
  for (const name of names) {
    const server = mcpServers[name];
    if (!server?.active) continue;
    try {
      await mcpService.activate(name, server);
    } catch (error: unknown) {
      mcpServers[name] = { ...server, active: false };
      failures.push(`${name}: ${errorMessage(error)}`);
    }
  }
  return { saved: { ...next, mcpServers }, failures };
}

async function reconfigure({ next, affected }: McpReconfigureVars): Promise<void> {
  const names = [...new Set(affected)];
  await disconnect(names);
  const { saved, failures } = await connect(next, names);
  await mcpService.saveConfig(saved);
  if (failures.length > 0) throw new Error(failures.join('\n'));
}

export function useMcpReconfigure() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: reconfigure,
    onMutate: async ({ next }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.mcpConfig() });
      const previous = queryClient.getQueryData<McpConfig>(queryKeys.mcpConfig());
      queryClient.setQueryData<McpConfig>(queryKeys.mcpConfig(), next);
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(queryKeys.mcpConfig(), context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.mcpConfig() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.mcpConnected() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.mcpTools() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.mcpServerInfo() });
    },
  });
}
