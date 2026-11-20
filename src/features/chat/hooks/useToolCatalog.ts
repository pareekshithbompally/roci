/** Tools picker state and actions; every toggle writes the saved chat tool preferences. */

import { useCallback, useMemo } from 'react';
import { generateImageTool, toolRegistry } from '@extensions/tools';
import { toolPromptTokens } from '@extensions/tools/tool-tokens';
import { useSettings } from '@shared/contexts/SettingsContext';
import { useToast } from '@shared/contexts/ToastContext';
import { useChatModel } from './useChatModel';
import { profileOf } from '@services/ai/models';
import { WEB_SEARCH_PROVIDERS } from '@config/providers.config';
import { useModelCatalog } from '@shared/hooks/useModelCatalog';
import { getProviderTitle } from '@shared/utils/provider.utils';
import { CHAT_TOOLS_CONFIG, chatToolPreferences } from '@config/chatTools.config';
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
import { buildCatalog, countEnabled, setToolsEnabled, tokensEnabled, withSwitches } from './toolCatalog';
import type { ToolSwitches } from './toolCatalog';
import type { CatalogGroup } from './toolCatalog';

/** The Image generation row: usable once an image model is chosen, then switched by the saved preference. */
function useImageGenerationToggle(prefs: ChatToolPreferences) {
  const { settings, providers, setSettings } = useSettings();
  const available = hasImageModel(settings);
  const { data: localModels = [] } = useLocalModels();
  const modelLabel = useMemo(() => {
    const cloud = imageModelOptions(providers).find((o) => o.provider === settings.imageProvider && o.model === settings.imageModel);
    // The chosen model's name where a list has it, else its id, so the row never says just "via".
    return cloud?.label ?? localModels.find((m) => m.id === settings.imageModel)?.name ?? settings.imageModel ?? '';
  }, [providers, localModels, settings.imageProvider, settings.imageModel]);
  const toggle = useCallback(
    () => setSettings({ chatTools: { ...prefs, imageGeneration: !prefs.imageGeneration } }),
    [prefs, setSettings],
  );
  // The definition chat sends; its name, description and schema don't depend on the model it draws with.
  const tokens = useMemo(() => toolPromptTokens(generateImageTool({ settings, providers })), [settings, providers]);
  return { available, enabled: available && prefs.imageGeneration, modelLabel, toggle, tokens };
}

export function useToolCatalog() {
  useMcpUpdateListener();
  const { settings, setSettings } = useSettings();
  const { showToast } = useToast();
  const { data: mcpConfig } = useMcpConfig();
  const { data: connected = [] } = useMcpConnectedServers();
  const { data: mcpTools = [] } = useMcpTools();
  const { data: serverInfo } = useMcpServerInfo();
  const reconfigure = useMcpReconfigure();

  useModelCatalog();

  const prefs = useMemo(() => chatToolPreferences({ chatTools: settings.chatTools }), [settings.chatTools]);
  const resolved = useChatModel();
  // Derived each render: useModelCatalog re-renders this hook when the models.dev cache arrives.
  const profile = resolved ? profileOf(resolved.provider, resolved.model) : null;

  const catalog = useMemo(
    () =>
      buildCatalog({
        builtInTools: toolRegistry.getTools(),
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

  const setSwitches = useCallback(
    (changes: ToolSwitches) => setSettings({ chatTools: withSwitches(prefs, changes) }),
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

  const toggleWebSearch = useCallback(
    () => setSettings({ chatTools: { ...prefs, webSearch: !prefs.webSearch } }),
    [prefs, setSettings],
  );

  const webSearchAvailable = !!resolved && WEB_SEARCH_PROVIDERS.has(resolved.provider);
  const imageGeneration = useImageGenerationToggle(prefs);

  return {
    modelSupportsTools: profile?.tools ?? false,
    modelName: resolved?.modelId ?? settings.chatModel,
    webSearch: {
      available: webSearchAvailable,
      enabled: webSearchAvailable && prefs.webSearch,
      providerLabel: resolved ? getProviderTitle(resolved.provider) : '',
      toggle: toggleWebSearch,
    },
    imageGeneration,
    builtIn: catalog.builtIn,
    servers: catalog.servers,
    enabledCount: countEnabled([catalog.builtIn, ...catalog.servers]) + (imageGeneration.enabled ? 1 : 0),
    /** Tokens the switched-on tools add to each request (web search is the provider's own and isn't counted). */
    enabledTokens: tokensEnabled([catalog.builtIn, ...catalog.servers]) + (imageGeneration.enabled ? imageGeneration.tokens : 0),
    askBeforeRunning: !(mcpConfig?.mcpSettings.allowAllTools ?? false),
    connectingServer: reconfigure.isPending ? reconfigure.variables?.affected[0] : undefined,
    setGroupEnabled,
    setSwitches,
    setToolEnabled,
    connectServer,
    setAskBeforeRunning,
  };
}

export type ToolCatalog = ReturnType<typeof useToolCatalog>;
