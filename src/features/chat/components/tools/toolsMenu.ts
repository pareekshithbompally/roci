/** The Mac Tools menu as native entries (switch rows stay open, MCP servers fan out), and what its switches change once it closes. */

import { Globe, ImageIcon, Info, Library, Plus, Settings2, ShieldCheck, ShieldQuestion } from 'lucide-react';
import { SiModelcontextprotocol } from '@icons-pack/react-simple-icons';
import { menuGlyph } from '@shared/components';
import type { NativeMenuEntry, NativeMenuResult } from '@services/tauri';
import type { ToolCatalog } from '@features/chat/hooks';
import type { CatalogGroup, ToolSwitches } from '@features/chat/hooks/toolCatalog';
import { TOOLS_MENU_COPY as COPY } from '@config/chatTools.config';

/** Row ids the menu reports back. */
export const TOOLS_MENU_IDS = {
  webSearch: 'web-search',
  imageGeneration: 'image-generation',
  meetingTools: 'meeting-tools',
  ask: 'ask-before-running',
  chooseImageModel: 'choose-image-model',
  manageMcp: 'manage-mcp',
  toolPrefix: 'tool:',
} as const;

const ID = TOOLS_MENU_IDS;

/** An app glyph tinted by the menu (light or dark). */
const glyph = (icon: Parameters<typeof menuGlyph>[0]) => ({ icon: menuGlyph(icon), template: true });

function builtInEntries(catalog: ToolCatalog): NativeMenuEntry[] {
  const { webSearch, imageGeneration, builtIn, modelSupportsTools } = catalog;
  const web: NativeMenuEntry = {
    kind: 'toggle', id: ID.webSearch, title: COPY.webSearch, on: webSearch.enabled, enabled: webSearch.available,
    subtitle: webSearch.available ? COPY.via(webSearch.providerLabel) : COPY.notForModel, ...glyph(Globe),
  };
  if (!modelSupportsTools) {
    return [web, { kind: 'row', id: 'tools-unavailable', title: COPY.cantUseTools(catalog.modelName), subtitle: COPY.pickToolModel, enabled: false, ...glyph(Info) }];
  }
  const image: NativeMenuEntry = imageGeneration.available
    ? { kind: 'toggle', id: ID.imageGeneration, title: COPY.imageGeneration, subtitle: COPY.via(imageGeneration.modelLabel), on: imageGeneration.enabled, enabled: true, ...glyph(ImageIcon) }
    : { kind: 'row', id: ID.chooseImageModel, title: COPY.imageGeneration, subtitle: COPY.chooseImageModel, enabled: true, ...glyph(ImageIcon) };
  const meetings: NativeMenuEntry[] = builtIn.tools.length > 0
    ? [{ kind: 'toggle', id: ID.meetingTools, title: builtIn.label, subtitle: COPY.toolCount(builtIn.tools.length), on: builtIn.enabledCount > 0, enabled: true, ...glyph(Library) }]
    : [];
  return [web, image, ...meetings];
}

/** A connected server fans out to a switch per tool; one still connecting or without tools is a plain, disabled row. */
function serverEntry(group: CatalogGroup, icon: string | null): NativeMenuEntry {
  const look = icon ? { icon } : glyph(SiModelcontextprotocol);
  if (group.status !== 'connected' || group.tools.length === 0) {
    const subtitle = group.status === 'connected' ? COPY.noTools : COPY.connecting;
    return { kind: 'row', id: `server:${group.key}`, title: group.label, subtitle, enabled: false, ...look };
  }
  return {
    kind: 'submenu', title: group.label, subtitle: COPY.onOf(group.enabledCount, group.tools.length), ...look,
    items: group.tools.map((tool): NativeMenuEntry => ({
      kind: 'toggle', id: `${ID.toolPrefix}${tool.key}`, title: tool.name, subtitle: tool.destructive ? COPY.writes : undefined, on: tool.enabled, enabled: true,
    })),
  };
}

function mcpEntries(catalog: ToolCatalog, serverIcons: Map<string, string | null>): NativeMenuEntry[] {
  const live = catalog.servers.filter((g) => g.status === 'connected' || g.status === 'connecting');
  const servers: NativeMenuEntry[] = live.length > 0
    ? live.map((g) => serverEntry(g, serverIcons.get(g.key) ?? null))
    : [{ kind: 'row', id: ID.manageMcp, ...(catalog.servers.length === 0
      ? { title: COPY.addServer, subtitle: COPY.addServerHint, ...glyph(Plus) }
      : { title: COPY.noConnected, subtitle: COPY.manage, ...glyph(Settings2) }), enabled: true }];
  return [{ kind: 'separator' }, { kind: 'header', title: COPY.mcpHeader }, ...servers];
}

function footerEntries(catalog: ToolCatalog): NativeMenuEntry[] {
  return [
    { kind: 'separator' },
    { kind: 'toggle', id: ID.ask, title: COPY.ask, on: catalog.askBeforeRunning, enabled: true, ...glyph(catalog.askBeforeRunning ? ShieldQuestion : ShieldCheck) },
    { kind: 'row', id: ID.manageMcp, title: COPY.manage, enabled: true, ...glyph(Settings2) },
  ];
}

/** The whole menu: built-in tools, then MCP servers and the approval switch where MCP exists. `serverIcons`: server key → cached icon URL. */
export function toolsMenu(catalog: ToolCatalog, hasMcp: boolean, serverIcons: Map<string, string | null>): NativeMenuEntry[] {
  const builtIn: NativeMenuEntry[] = [{ kind: 'header', title: COPY.builtInHeader }, ...builtInEntries(catalog)];
  if (!hasMcp) return builtIn;
  const mcp = catalog.modelSupportsTools ? mcpEntries(catalog, serverIcons) : [];
  return [...builtIn, ...mcp, ...footerEntries(catalog)];
}

/** The switches the menu reports, as one set of preference changes. */
export function toolSwitches(toggled: NativeMenuResult['toggled']): ToolSwitches {
  const mcpTools = Object.fromEntries(Object.entries(toggled)
    .filter(([id]) => id.startsWith(ID.toolPrefix))
    .map(([id, on]) => [id.slice(ID.toolPrefix.length), on]));
  return {
    webSearch: toggled[ID.webSearch],
    imageGeneration: toggled[ID.imageGeneration],
    meetingTools: toggled[ID.meetingTools],
    ...(Object.keys(mcpTools).length > 0 && { mcpTools }),
  };
}
