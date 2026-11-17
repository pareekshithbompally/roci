/** Tools picker state and actions; every toggle writes the saved chat tool preferences. */

import { useCallback, useMemo } from 'react';
import { toolRegistry } from '@extensions/tools';
import { useSettings } from '@shared/contexts/SettingsContext';
import { useToast } from '@shared/contexts/ToastContext';
import { resolveChatModel } from '@shared/utils/modelResolver';
import { capabilitiesOf } from '@services/ai/capabilities';
import { useModelCatalog } from '@shared/hooks/useModelCatalog';
import { getProviderTitle } from '@shared/utils/provider.utils';
import { CHAT_TOOLS_CONFIG, DEFAULT_CHAT_TOOLS } from '@config/chatTools.config';
import { hasImageModel, imageModelOptions } from '@services/ai/image';
import type { ChatToolPreferences } from '@shared/types';
import { useLocalModels } from '@shared/hooks/useLocalModels';
import {
  useMcpConfig,
  useMcpConnectedServers,
  useMcpReconfigure,
  useMcpServerInfo,
  useMcpTools,
  useMcpUpdateListener,
} from '@features/settings/hooks';
import { toggleServer, updateSettings } from '@features/settings/components/mcp';
import { useChatStore } from '@features/chat/stores/chatStore';
import { buildCatalog, countEnabled, setToolsEnabled } from './toolCatalog';
import type { CatalogGroup } from './toolCatalog';

/** The Image generation row: usable once an image model is chosen, then switched by the saved preference. */
function useImageGenerationToggle(prefs: ChatToolPreferences) {
  const { settings, providers, setSettings } = useSettings();
  const available = hasImageModel(settings);
  const { data: localModels = [] } = useLocalModels();
  const modelLabel = useMemo(() => {
    const cloud = imageModelOptions(providers).find((o) => o.provider === settings.imageProvider && o.model === settings.imageModel);
    return cloud?.label ?? localModels.find((m) => m.id === settings.imageModel)?.name ?? '';
  }, [providers, localModels, settings.imageProvider, settings.imageModel]);
  const toggle = useCallback(
    () => setSettings({ chatTools: { ...prefs, imageGeneration: !prefs.imageGeneration } }),
    [prefs, setSettings],
  );
  return { available, enabled: available && prefs.imageGeneration, modelLabel, toggle };
}

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

  const prefs = useMemo(() => ({ ...DEFAULT_CHAT_TOOLS, ...settings.chatTools }), [settings.chatTools]);
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

  /** Ask before running MCP tools, or run them without asking: the same setting as Settings › MCP. */
  const setAskBeforeRunning = useCallback(
    (ask: boolean) => {
      if (!mcpConfig) return;
      reconfigure.mutateAsync(updateSettings(mcpConfig, { allowAllTools: !ask })).catch((error: unknown) => {
        console.error('[useToolCatalog] Changing tool approval failed:', error);
        showToast('Couldn’t change tool approval', 'error');
      });
    },
    [mcpConfig, reconfigure, showToast],
  );

  const webSearchAvailable = capabilities?.webSearch ?? false;
  const imageGeneration = useImageGenerationToggle(prefs);

  return {
    modelSupportsTools: capabilities?.tools ?? false,
    modelName: resolved?.modelId ?? settings.chatModel,
    webSearch: {
      available: webSearchAvailable,
      enabled: webSearchAvailable && webSearchEnabled,
      providerLabel: resolved ? getProviderTitle(resolved.provider) : '',
      toggle: toggleWebSearch,
    },
    imageGeneration,
    builtIn: catalog.builtIn,
    servers: catalog.servers,
    enabledCount: countEnabled([catalog.builtIn, ...catalog.servers]) + (imageGeneration.enabled ? 1 : 0),
    askBeforeRunning: !(mcpConfig?.mcpSettings.allowAllTools ?? false),
    connectingServer: reconfigure.isPending ? reconfigure.variables?.affected[0] : undefined,
    setGroupEnabled,
    setToolEnabled,
    connectServer,
    setAskBeforeRunning,
  };
}

export type ToolCatalog = ReturnType<typeof useToolCatalog>;
