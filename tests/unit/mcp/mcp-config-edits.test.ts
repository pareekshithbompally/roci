import { describe, it, expect } from 'vitest';
import { DEFAULT_MCP_SETTINGS } from '@config/mcp.config';
import type { McpConfig, McpServerConfig } from '@config/mcp.config';
import {
  applyJson,
  deleteServer,
  toggleServer,
  updateSettings,
  upsertServers,
} from '@features/settings/components/mcp/mcpConfigEdits';
import {
  configFromForm,
  formFromConfig,
  maskKeys,
  maskUrl,
  parseServerEntries,
  validateForm,
  EMPTY_FORM,
} from '@features/settings/components/mcp/mcpServerForm';

const stdio = (over: Partial<McpServerConfig> = {}): McpServerConfig => ({ command: 'npx', args: ['-y', 'x'], env: {}, ...over });
const config = (): McpConfig => ({
  mcpServers: { a: stdio({ active: true }), b: stdio({ active: false }) },
  mcpSettings: { ...DEFAULT_MCP_SETTINGS },
});

describe('mcpConfigEdits', () => {
  it('adds a new server enabled and appended', () => {
    const { next, affected } = upsertServers(config(), null, [['c', stdio()]]);
    expect(Object.keys(next.mcpServers)).toEqual(['a', 'b', 'c']);
    expect(next.mcpServers.c.active).toBe(true);
    expect(affected).toEqual(['c']);
  });

  it('renames in place, keeping order and the active flag', () => {
    const { next, affected } = upsertServers(config(), 'b', [['renamed', stdio({ command: 'uvx' })]]);
    expect(Object.keys(next.mcpServers)).toEqual(['a', 'renamed']);
    expect(next.mcpServers.renamed).toMatchObject({ command: 'uvx', active: false });
    expect(affected).toEqual(['b', 'renamed']);
  });

  it('toggles and deletes one server', () => {
    expect(toggleServer(config(), 'b', true).next.mcpServers.b.active).toBe(true);
    const removed = deleteServer(config(), 'a');
    expect(Object.keys(removed.next.mcpServers)).toEqual(['b']);
    expect(removed.affected).toEqual(['a']);
  });

  it('saved permissions follow renames and go away with deletes', () => {
    const trusted = { ...config(), mcpSettings: { ...DEFAULT_MCP_SETTINGS, trustedServers: ['a', 'b'] } };
    expect(upsertServers(trusted, 'a', [['a2', stdio()]]).next.mcpSettings.trustedServers).toEqual(['a2', 'b']);
    expect(deleteServer(trusted, 'b').next.mcpSettings.trustedServers).toEqual(['a']);
  });

  it('settings changes touch no connection', () => {
    const { next, affected } = updateSettings(config(), { allowAllTools: true });
    expect(next.mcpSettings.allowAllTools).toBe(true);
    expect(affected).toEqual([]);
  });

  it('applies whole-config JSON, wrapped or bare', () => {
    const wrapped = applyJson(config(), { mcpServers: { z: stdio() }, mcpSettings: { toolCallTimeoutSeconds: 5 } }, null);
    expect(Object.keys(wrapped.next.mcpServers)).toEqual(['z']);
    expect(wrapped.next.mcpSettings.toolCallTimeoutSeconds).toBe(5);
    expect(wrapped.next.mcpSettings.maxToolOutputChars).toBe(DEFAULT_MCP_SETTINGS.maxToolOutputChars);
    expect(wrapped.affected.sort()).toEqual(['a', 'b', 'z']);

    const bare = applyJson(config(), { z: stdio() }, null);
    expect(Object.keys(bare.next.mcpServers)).toEqual(['z']);
  });

  it('applies single-server JSON and rejects non-objects', () => {
    const { next } = applyJson(config(), { command: 'node', args: [] }, 'a');
    expect(next.mcpServers.a).toMatchObject({ command: 'node', active: false });
    expect(() => applyJson(config(), [], 'a')).toThrow('Expected a JSON object.');
  });
});

describe('mcpServerForm', () => {
  it('round-trips stdio config through the form', () => {
    const original = stdio({ env: { KEY: 'v' }, active: true });
    const back = configFromForm(formFromConfig('s', original), original);
    expect(back).toMatchObject({ type: 'stdio', command: 'npx', args: ['-y', 'x'], env: { KEY: 'v' }, active: true });
  });

  it('builds http config with headers and timeout, dropping blanks', () => {
    const cfg = configFromForm({ ...EMPTY_FORM, name: 'h', transport: 'http', url: ' https://x/mcp ', headers: [['Authorization', 'Bearer t'], [' ', 'x']], timeout: '10' });
    expect(cfg).toMatchObject({ type: 'http', url: 'https://x/mcp', headers: { Authorization: 'Bearer t' }, timeout: 10, command: '' });
  });

  it('validates required fields per transport', () => {
    expect(validateForm(EMPTY_FORM)).toBe('Enter a server name.');
    expect(validateForm({ ...EMPTY_FORM, name: 'x' })).toMatch(/command/);
    expect(validateForm({ ...EMPTY_FORM, name: 'x', transport: 'sse' })).toMatch(/URL/);
    expect(validateForm({ ...EMPTY_FORM, name: 'x', command: 'npx' })).toBeNull();
  });

  it('parses README-style JSON and rejects unnamed configs', () => {
    const entries = parseServerEntries('{"mcpServers":{"fs":{"command":"npx","args":["a"]}}}');
    expect(entries).toEqual([['fs', { command: 'npx', args: ['a'], env: {} }]]);
    expect(() => parseServerEntries('{"command":"npx"}')).toThrow(/server name/);
    expect(() => parseServerEntries('{"x":{"type":"ws","url":"u"}}')).toThrow(/unknown type/);
  });

  it('masks secrets for display', () => {
    expect(maskUrl('https://x.dev/mcp?api_key=abc&q=1')).toBe('https://x.dev/mcp?api_key=******&q=1');
    expect(maskKeys({ TOKEN: 'secret', B: 'x' })).toBe('TOKEN=******, B=******');
  });
});
