import { describe, it, expect } from 'vitest';
import { buildCatalog, countEnabled, setToolsEnabled, tokensEnabled } from '@features/chat/hooks/toolCatalog';
import { mcpToolShape } from '@extensions/tools/mcp-tools';
import { toolPromptTokens } from '@extensions/tools/tool-tokens';
import type { CatalogInput } from '@features/chat/hooks/toolCatalog';

const tool = (server: string, name: string, destructive = false) => ({
  server, name, description: `${name} desc`, inputSchema: {}, destructive,
});

const input = (over: Partial<CatalogInput> = {}): CatalogInput => ({
  builtInTools: [
    { name: 'search_meetings', description: 'Search meetings.', parameters: { type: 'object', properties: {} } },
    { name: 'get_meeting', description: 'Read one meeting.', parameters: { type: 'object', properties: {} } },
  ],
  builtInLabel: 'Meetings & chats',
  servers: {
    fs: { command: 'npx', args: [], env: {}, active: true },
    think: { command: 'npx', args: [], env: {}, active: true },
    serper: { command: 'npx', args: [], env: {}, active: false },
  },
  connected: ['fs'],
  mcpTools: [tool('fs', 'read_file'), tool('fs', 'write_file', true)],
  prefs: { meetingTools: true, imageGeneration: true, webSearch: true, disabledMcpTools: ['fs/write_file'] },
  ...over,
});

describe('tool catalog', () => {
  it('builds the built-in group and one group per configured server with status', () => {
    const { builtIn, servers } = buildCatalog(input());
    expect(builtIn).toMatchObject({ perTool: false, enabledCount: 2, status: 'builtin' });
    expect(servers.map((g) => [g.label, g.status])).toEqual([['fs', 'connected'], ['think', 'connecting'], ['serper', 'off']]);
    const fs = servers[0];
    expect(fs.tools.map((t) => [t.name, t.enabled, t.destructive])).toEqual([['read_file', true, false], ['write_file', false, true]]);
    expect(fs.enabledCount).toBe(1);
  });

  it('counts only tools the model will get (built-ins + connected servers)', () => {
    const { builtIn, servers } = buildCatalog(input());
    expect(countEnabled([builtIn, ...servers])).toBe(3);
    const off = buildCatalog(input({ prefs: { meetingTools: false, imageGeneration: true, webSearch: true, disabledMcpTools: [] } }));
    expect(countEnabled([off.builtIn, ...off.servers])).toBe(2);
  });

  it('sizes each tool as the model reads it, and sums only the switched-on tools chat sends', () => {
    const { builtIn, servers } = buildCatalog(input());
    const read = toolPromptTokens(mcpToolShape(tool('fs', 'read_file')));
    expect(servers[0].tools[0].tokens).toBe(read);
    expect(servers[0].enabledTokens).toBe(read);
    expect(tokensEnabled([builtIn, ...servers])).toBe(builtIn.enabledTokens + read);
    const off = buildCatalog(input({ prefs: { meetingTools: false, imageGeneration: true, webSearch: true, disabledMcpTools: [] } }));
    expect(off.builtIn.enabledTokens).toBe(0);
  });

  it('switches tool keys on and off without duplicates', () => {
    expect(setToolsEnabled(['a/x'], ['a/x', 'a/y'], false).sort()).toEqual(['a/x', 'a/y']);
    expect(setToolsEnabled(['a/x', 'a/y'], ['a/x'], true)).toEqual(['a/y']);
  });
});
