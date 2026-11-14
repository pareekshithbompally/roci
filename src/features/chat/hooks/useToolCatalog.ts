/**
 * useToolCatalog — state + actions for the composer Tools picker.
 *
 * Sources: saved tool preferences (AppSettings.chatTools), MCP config /
 * connection / tools queries, the chat store's web search switch, and the
 * selected model's capabilities (`capabilitiesOf`). Every toggle writes the saved preferences;
 * "Connect" enables the server through the same reconfigure path as Settings.
 */

import { useCallback, useMemo } from 'react';
import { toolRegistry } from '@extensions/tools';
import { useSettings } from '@shared/contexts/SettingsContext';
import { useToast } from '@shared/contexts/ToastContext';
import { resolveChatModel } from '@shared/utils/modelResolver';
import { capabilitiesOf } from '@services/ai/capabilities';
import { useModelCatalog } from '@shared/hooks/useModelCatalog';
import { getProviderTitle } from '@shared/utils/provider.utils';
import { CHAT_TOOLS_CONFIG, DEFAULT_CHAT_TOOLS } from '@config/chatTools.config';
import {
  useMcpConfig,
  useMcpConnectedServers,
  useMcpReconfigure,
  useMcpServerInfo,
  useMcpTools,
  useMcpUpdateListener,
} from '@features/settings/hooks';
import { toggleServer } from '@features/settings/components/mcp';
import { useChatStore } from '@features/chat/stores/chatStore';
import { buildCatalog, countEnabled, setToolsEnabled } from './toolCatalog';
import type { CatalogGroup } from './toolCatalog';

export function useToolCatalog() {
  useMcpUpdateListener();
  const { settings, providers, setSettings } = useSettings();
  const { showToast } = useToast();
  const { data: mcpConfig } = useMcpConfig();
  const { data: connected = [] } = useMcpConnectedServers();
  const { data: mcpTools = [] } = useMcpTools();
  const { data: serverInfo } = useMcpServerInfo();
  const reconfigure = useMcpReconfigure();
  const webSearchEnabled = useChatStore((s) => s.webSearchEnabled);
  const toggleWebSearch = useChatStore((s) => s.toggleWebSearch);

  useModelCatalog();

  const prefs = settings.chatTools ?? DEFAULT_CHAT_TOOLS;
  const resolved = useMemo(() => resolveChatModel(settings, providers), [settings, providers]);
  // Derived each render: useModelCatalog re-renders this hook when the models.dev cache arrives.
  const capabilities = resolved ? capabilitiesOf(resolved.provider, resolved.model) : null;

  const catalog = useMemo(
    () =>
      buildCatalog({
        builtInNames: toolRegistry.getToolNames(),
        builtInLabel: CHAT_TOOLS_CONFIG.meetingGroupLabel,
        servers: mcpConfig?.mcpServers ?? {},
        connected,
        mcpTools,
        prefs,
        serverIcons: new Map([...(serverInfo ?? new Map()).values()].map((info) => [info.name, info.icon])),
      }),
    [mcpConfig, connected, mcpTools, prefs, serverInfo],
  );

  const setGroupEnabled = useCallback(
    (group: CatalogGroup, enabled: boolean) => {
      if (!group.perTool) {
        setSettings({ chatTools: { ...prefs, meetingTools: enabled } });
        return;
      }
      const keys = group.tools.map((t) => t.key);
      setSettings({ chatTools: { ...prefs, disabledMcpTools: setToolsEnabled(prefs.disabledMcpTools, keys, enabled) } });
    },
    [prefs, setSettings],
  );

  const setToolEnabled = useCallback(
    (key: string, enabled: boolean) => {
      setSettings({ chatTools: { ...prefs, disabledMcpTools: setToolsEnabled(prefs.disabledMcpTools, [key], enabled) } });
    },
    [prefs, setSettings],
  );

  const connectServer = useCallback(
    (name: string) => {
      if (!mcpConfig) return;
      reconfigure.mutateAsync(toggleServer(mcpConfig, name, true)).catch((error: unknown) => {
        console.error(`[useToolCatalog] Connecting ${name} failed:`, error);
        showToast(`Couldn’t connect ${name}`, 'error');
      });
    },
    [mcpConfig, reconfigure, showToast],
  );

  const webSearchAvailable = capabilities?.webSearch ?? false;

  return {
    modelSupportsTools: capabilities?.tools ?? false,
    modelName: resolved?.modelId ?? settings.chatModel,
    webSearch: {
      available: webSearchAvailable,
      enabled: webSearchAvailable && webSearchEnabled,
      providerLabel: resolved ? getProviderTitle(resolved.provider) : '',
      toggle: toggleWebSearch,
    },
    builtIn: catalog.builtIn,
    servers: catalog.servers,
    enabledCount: countEnabled([catalog.builtIn, ...catalog.servers]),
    askBeforeRunning: !(mcpConfig?.mcpSettings.allowAllTools ?? false),
    connectingServer: reconfigure.isPending ? reconfigure.variables?.affected[0] : undefined,
    setGroupEnabled,
    setToolEnabled,
    connectServer,
  };
}

export type ToolCatalog = ReturnType<typeof useToolCatalog>;
