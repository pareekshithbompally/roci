import { describe, it, expect } from 'vitest';
import { buildCatalog, countEnabled, setToolsEnabled } from '@features/chat/hooks/toolCatalog';
import type { CatalogInput } from '@features/chat/hooks/toolCatalog';

const tool = (server: string, name: string, destructive = false) => ({
  server, name, description: `${name} desc`, inputSchema: {}, destructive,
});

const input = (over: Partial<CatalogInput> = {}): CatalogInput => ({
  builtInNames: ['search_meetings', 'get_meeting'],
  builtInLabel: 'Meetings & chats',
  servers: {
    fs: { command: 'npx', args: [], env: {}, active: true },
    think: { command: 'npx', args: [], env: {}, active: true },
    serper: { command: 'npx', args: [], env: {}, active: false },
  },
  connected: ['fs'],
  mcpTools: [tool('fs', 'read_file'), tool('fs', 'write_file', true)],
  prefs: { meetingTools: true, imageGeneration: true, disabledMcpTools: ['fs/write_file'] },
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
    const off = buildCatalog(input({ prefs: { meetingTools: false, imageGeneration: true, disabledMcpTools: [] } }));
    expect(countEnabled([off.builtIn, ...off.servers])).toBe(2);
  });

  it('switches tool keys on and off without duplicates', () => {
    expect(setToolsEnabled(['a/x'], ['a/x', 'a/y'], false).sort()).toEqual(['a/x', 'a/y']);
    expect(setToolsEnabled(['a/x', 'a/y'], ['a/x'], true)).toEqual(['a/y']);
  });
});
