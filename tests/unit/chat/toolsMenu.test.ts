import { describe, it, expect, vi } from 'vitest';

vi.mock('@shared/components', () => ({ menuGlyph: () => 'glyph' }));

import { TOOLS_MENU_IDS, toolSwitches, toolsMenu } from '@features/chat/components/tools/toolsMenu';
import { withSwitches } from '@features/chat/hooks/toolCatalog';
import type { ToolCatalog } from '@features/chat/hooks';

const catalog = (over: Partial<ToolCatalog> = {}): ToolCatalog => ({
  modelSupportsTools: true,
  modelName: 'gpt-5',
  webSearch: { available: true, enabled: true, providerLabel: 'OpenAI', toggle: vi.fn() },
  imageGeneration: { available: true, enabled: false, modelLabel: 'gpt-image-1.5', toggle: vi.fn(), tokens: 90 },
  resultViews: { enabled: true, toggle: vi.fn(), tokens: 300 },
  builtIn: { key: 'builtin', label: 'Meetings & chats', status: 'builtin', perTool: false, icon: null, enabledCount: 3, tools: [{ key: 'a', name: 'a', description: null, destructive: false, enabled: true }] },
  servers: [
    { key: 'fs', label: 'fs', status: 'connected', perTool: true, icon: 'https://x/icon.png', enabledCount: 1, tools: [
      { key: 'fs/read', name: 'read', description: null, destructive: false, enabled: true, tokens: 400 },
      { key: 'fs/write', name: 'write', description: null, destructive: true, enabled: false, tokens: 1_100 },
    ] },
    { key: 'slow', label: 'slow', status: 'connecting', perTool: true, icon: null, enabledCount: 0, tools: [] },
  ],
  askBeforeRunning: true,
  ...over,
} as unknown as ToolCatalog);

describe('Mac Tools menu', () => {
  it('built-in tools are switch rows; each connected server fans out to its own switch, then a switch per tool', () => {
    const entries = toolsMenu(catalog(), true, new Map([['fs', 'data:server-icon']]));
    expect(entries.map((e) => e.kind)).toEqual(['header', 'toggle', 'toggle', 'toggle', 'toggle', 'separator', 'header', 'submenu', 'row', 'separator', 'toggle', 'row']);
    expect(entries[3]).toMatchObject({ kind: 'toggle', id: TOOLS_MENU_IDS.resultViews, title: 'Charts & tables', on: true });
    const fs = entries[7];
    expect(fs).toMatchObject({ kind: 'submenu', title: 'fs', subtitle: '1 of 2 on', icon: 'data:server-icon' });
    if (fs.kind === 'submenu') expect(fs.items).toEqual([
      // What all its tools add, whichever are flipped while the menu is open.
      { kind: 'toggle', id: 'server-tools:fs', title: 'All tools', subtitle: '≈1.5k tokens each message', on: true, enabled: true, leads: true },
      { kind: 'separator' },
      { kind: 'toggle', id: 'tool:fs/read', title: 'read', subtitle: undefined, on: true, enabled: true },
      { kind: 'toggle', id: 'tool:fs/write', title: 'write', subtitle: 'Writes', on: false, enabled: true },
    ]);
    expect(entries[8]).toMatchObject({ kind: 'row', title: 'slow', subtitle: 'Connecting…', enabled: false, icon: 'glyph', template: true });
  });

  it('a model without tools offers web search only, with the reason; no MCP section', () => {
    const entries = toolsMenu(catalog({ modelSupportsTools: false }), true, new Map());
    expect(entries.map((e) => e.kind)).toEqual(['header', 'toggle', 'row', 'separator', 'toggle', 'row']);
    expect(entries[2]).toMatchObject({ title: 'gpt-5 can’t use tools', enabled: false });
  });

  it('without an image model, image generation is a row that opens Settings', () => {
    const entries = toolsMenu(catalog({ imageGeneration: { available: false, enabled: false, modelLabel: '', toggle: vi.fn(), tokens: 0 } }), false, new Map());
    expect(entries[2]).toMatchObject({ kind: 'row', id: TOOLS_MENU_IDS.chooseImageModel });
  });

  it('every switch flipped while open becomes one set of changes, applied in one write', () => {
    // A server's own switch is never read back: only the tool switches it flipped are.
    const changes = toolSwitches({ 'web-search': false, 'meeting-tools': false, 'tool:fs/write': true, 'tool:fs/read': false, 'ask-before-running': false, 'server-tools:fs': true });
    expect(changes).toEqual({ webSearch: false, imageGeneration: undefined, resultViews: undefined, meetingTools: false, mcpTools: { 'fs/write': true, 'fs/read': false } });
    const prefs = { meetingTools: true, imageGeneration: true, resultViews: true, webSearch: true, disabledMcpTools: ['fs/write'] };
    expect(withSwitches(prefs, changes)).toEqual({ meetingTools: false, imageGeneration: true, resultViews: true, webSearch: false, disabledMcpTools: ['fs/read'] });
  });
});
