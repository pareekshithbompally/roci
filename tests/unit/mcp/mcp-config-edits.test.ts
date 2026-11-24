import { describe, it, expect } from 'vitest';
import { DEFAULT_MCP_SETTINGS } from '@config/mcp.config';
import type { McpConfig, McpServerConfig } from '@config/mcp.config';
import {
  applyJson,
  deleteServer,
  toggleServer,
  updateSettings,
  upsertServers,
  setTrust,
} from '@features/settings/components/mcp/mcpConfigEdits';
import {
  configFromForm,
  formFromConfig,
  maskUrl,
  parseServerEntries,
  serverStatus,
  isComplete,
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
    const wrapped = applyJson(config(), { mcpServers: { z: stdio() }, mcpSettings: { toolCallTimeoutSeconds: 5 } });
    expect(Object.keys(wrapped.next.mcpServers)).toEqual(['z']);
    expect(wrapped.next.mcpSettings.toolCallTimeoutSeconds).toBe(5);
    expect(wrapped.next.mcpSettings.maxToolOutputChars).toBe(DEFAULT_MCP_SETTINGS.maxToolOutputChars);
    expect(wrapped.affected.sort()).toEqual(['a', 'b', 'z']);

    const bare = applyJson(config(), { z: stdio() });
    expect(Object.keys(bare.next.mcpServers)).toEqual(['z']);
  });

  it('reconnects only the servers the JSON changed', () => {
    const current = config();
    expect(applyJson(current, current).affected).toEqual([]);
    const edited = { ...current.mcpServers, b: stdio({ active: false, command: 'uvx' }) };
    expect(applyJson(current, { mcpServers: edited }).affected).toEqual(['b']);
    const newKey = { ...current.mcpServers, a: stdio({ active: true, env: { KEY: 'v' } }) };
    expect(applyJson(current, { mcpServers: newKey }).affected).toEqual(['a']);
  });

  it('settings alone keep every server', () => {
    const { next, affected } = applyJson(config(), { mcpSettings: { allowAllTools: true } });
    expect(Object.keys(next.mcpServers)).toEqual(['a', 'b']);
    expect(affected).toEqual([]);
  });

  it('checks each server, as a pasted one is', () => {
    expect(() => applyJson(config(), { x: 'oops' })).toThrow(/must be an object/);
  });

  it('a new server starts on even when a failed first try saved it off', () => {
    const failed = { ...config(), mcpServers: { ...config().mcpServers, c: stdio({ active: false }) } };
    expect(upsertServers(failed, null, [['c', stdio()]]).next.mcpServers.c.active).toBe(true);
  });

  it('rejects non-object JSON', () => {
    expect(() => applyJson(config(), [])).toThrow('Expected a JSON object.');
  });
});

describe('mcpServerForm', () => {
  it('round-trips stdio config through the form', () => {
    const original = stdio({ env: { KEY: 'v' }, active: true });
    const back = configFromForm(formFromConfig('s', original, false), original);
    expect(back).toMatchObject({ type: 'stdio', command: 'npx', args: ['-y', 'x'], env: { KEY: 'v' }, active: true });
  });

  it('builds http config with headers and timeout, dropping blanks', () => {
    const cfg = configFromForm({ ...EMPTY_FORM, name: 'h', transport: 'http', url: ' https://x/mcp ', headers: [['Authorization', 'Bearer t'], [' ', 'x']], timeout: '10' });
    expect(cfg).toMatchObject({ type: 'http', url: 'https://x/mcp', headers: { Authorization: 'Bearer t' }, timeout: 10, command: '' });
  });

  it('is complete with a name and the command or address its transport needs', () => {
    expect(isComplete({ ...EMPTY_FORM, transport: 'stdio', name: 'x' })).toBe(false);
    expect(isComplete({ ...EMPTY_FORM, transport: 'stdio', name: 'x', command: 'npx' })).toBe(true);
    expect(isComplete({ ...EMPTY_FORM, transport: 'http', name: 'x', url: 'https://x/mcp' })).toBe(true);
  });

  it('parses README-style JSON and rejects unnamed configs', () => {
    const entries = parseServerEntries('{"mcpServers":{"fs":{"command":"npx","args":["a"]}}}');
    expect(entries).toEqual([['fs', { command: 'npx', args: ['a'], env: {} }]]);
    expect(() => parseServerEntries('{"command":"npx"}')).toThrow(/server name/);
    expect(parseServerEntries('{"docs":{"url":"https://x/mcp"}}')[0][1].type).toBe('http');
    expect(() => parseServerEntries('{"x":{"type":"ws","url":"u"}}')).toThrow(/unknown type/);
  });

  it('derives the row status, flagging enabled-but-unconnected servers', () => {
    const state = { active: true, connected: false, pending: false, online: true };
    expect(serverStatus({ ...state, pending: true })).toBe('connecting');
    expect(serverStatus({ ...state, active: false, connected: true, pending: true })).toBe('stopping');
    expect(serverStatus({ ...state, active: false })).toBe('off');
    expect(serverStatus({ ...state, connected: true })).toBe('connected');
    expect(serverStatus(state)).toBe('notConnected');
    // The device being offline explains an unconnected server; a connected one stays connected.
    expect(serverStatus({ ...state, online: false })).toBe('noNetwork');
    expect(serverStatus({ ...state, connected: true, online: false })).toBe('connected');
  });

  it('masks secrets for display', () => {
    expect(maskUrl('https://x.dev/mcp?api_key=abc&q=1')).toBe('https://x.dev/mcp?api_key=******&q=1');
  });
});

describe('setTrust', () => {
  it('sets one server\'s always allow on top of another edit', () => {
    const vars = setTrust({ next: config(), affected: ['a'] }, 'b', true);
    expect(vars.next.mcpSettings.trustedServers).toContain('b');
    expect(vars.affected).toEqual(['a']);
    expect(setTrust(vars, 'b', false).next.mcpSettings.trustedServers).not.toContain('b');
  });
});
