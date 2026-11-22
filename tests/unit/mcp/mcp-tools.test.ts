import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DEFAULT_MCP_SETTINGS } from '@config/mcp.config';
import type { McpSettings } from '@config/mcp.config';

const service = vi.hoisted(() => ({
  getTools: vi.fn(),
  getConfig: vi.fn(),
  saveConfig: vi.fn(),
  callTool: vi.fn(),
  cancelToolCall: vi.fn(),
}));
vi.mock('@services/mcp.service', () => ({ mcpService: service }));
vi.mock('@services/tauri', () => ({ isTauriEnvironment: () => true }));
vi.mock('@shared/query/queryClient', () => ({ queryClient: { invalidateQueries: vi.fn() } }));

import { callToolFromScreen, loadMcpSettings, loadMcpTools } from '@extensions/tools/mcp-tools';
import { useToolApprovalStore } from '@shared/stores/toolApprovalStore';
import type { ToolContext } from '@extensions/tools/types';

const TOOL = { name: 'read_file', description: 'Read a file', inputSchema: { type: 'object', properties: { path: { type: 'string' } } }, server: 'fs', destructive: false };
const ctx: ToolContext = { approval: 'chat' };

let settings: McpSettings = DEFAULT_MCP_SETTINGS;

function setup(overrides: Partial<McpSettings> = {}) {
  settings = { ...DEFAULT_MCP_SETTINGS, ...overrides };
  const config = { mcpServers: {}, mcpSettings: settings };
  service.getTools.mockResolvedValue([TOOL, { ...TOOL, name: 'search_meetings' }]);
  service.getConfig.mockResolvedValue(config);
  service.saveConfig.mockResolvedValue(undefined);
  service.callTool.mockResolvedValue({ text: 'contents', isError: false });
}

async function answerNextPrompt(decision: 'allow-once' | 'allow-always' | 'deny') {
  await vi.waitFor(() => expect(useToolApprovalStore.getState().pending).toHaveLength(1));
  const [request] = useToolApprovalStore.getState().pending;
  useToolApprovalStore.getState().resolveApproval(request.toolCallId, decision);
}

describe('loadMcpTools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useToolApprovalStore.setState({ pending: [] });
  });

  it('maps tools to definitions and drops ones shadowing built-ins', async () => {
    setup();
    const defs = await loadMcpTools(new Set(['search_meetings']), settings);
    expect(defs.map((d) => d.name)).toEqual(['read_file']);
    expect(defs[0]).toMatchObject({ description: 'Read a file', timeoutMs: null, maxResultChars: null });
    expect(defs[0].parameters.type).toBe('object');
  });

  it('keeps tools only their MCP App screen may call away from the model', async () => {
    setup();
    service.getTools.mockResolvedValue([TOOL, { ...TOOL, name: 'refresh_chart', ui: { visibility: ['app'] } }]);
    const defs = await loadMcpTools(new Set(), settings);
    expect(defs.map((d) => d.name)).toEqual(['read_file']);
  });

  it("asks for the whole result when the tool has a screen, and hands it to the screen, not the model", async () => {
    setup({ allowAllTools: true });
    const result = { content: [{ type: 'text', text: 'contents' }], structuredContent: { rows: 2 } };
    service.getTools.mockResolvedValue([{ ...TOOL, ui: { resourceUri: 'ui://fs/view' } }]);
    service.callTool.mockResolvedValue({ text: 'contents', isError: false, result });
    const [def] = await loadMcpTools(new Set(), settings);
    const out = await def.execute({ path: 'a' }, ctx);
    expect(service.callTool).toHaveBeenCalledWith(expect.objectContaining({ withResult: true }));
    expect(out.content).toBe('contents');
    expect(out.meta?.app).toEqual({ server: 'fs', resourceUri: 'ui://fs/view', input: { path: 'a' }, result });
  });

  it('drops tools the user switched off and tags the rest with their server', async () => {
    setup();
    const defs = await loadMcpTools(new Set(['search_meetings']), settings, new Set(['fs/read_file']));
    expect(defs).toEqual([]);
    const [def] = await loadMcpTools(new Set(), settings);
    expect(def.source).toBe('fs');
  });

  it('runs without asking when all tools are allowed', async () => {
    setup({ allowAllTools: true });
    const [def] = await loadMcpTools(new Set(), settings);
    const result = await def.execute({ path: '/a' }, ctx);
    expect(result).toMatchObject({ content: 'contents', isError: false });
    expect(service.callTool).toHaveBeenCalledWith(expect.objectContaining({ server: 'fs', tool: 'read_file', arguments: { path: '/a' } }));
  });

  it('asks, and a denial never reaches the server', async () => {
    setup();
    const [def] = await loadMcpTools(new Set(), settings);
    const running = def.execute({}, ctx);
    await answerNextPrompt('deny');
    expect((await running).isError).toBe(true);
    expect(service.callTool).not.toHaveBeenCalled();
  });

  it('"always allow" persists the server and skips later prompts this turn', async () => {
    setup();
    const [def] = await loadMcpTools(new Set(), settings);
    const first = def.execute({}, ctx);
    await answerNextPrompt('allow-always');
    await first;
    expect(service.saveConfig).toHaveBeenCalledWith(expect.objectContaining({
      mcpSettings: expect.objectContaining({ trustedServers: ['fs'] }),
    }));
    await def.execute({}, ctx);
    expect(useToolApprovalStore.getState().pending).toHaveLength(0);
    expect(service.callTool).toHaveBeenCalledTimes(2);
  });

  it('Stop while a prompt is open denies it', async () => {
    setup();
    const [def] = await loadMcpTools(new Set(), settings);
    const controller = new AbortController();
    const running = def.execute({}, { ...ctx, signal: controller.signal });
    await vi.waitFor(() => expect(useToolApprovalStore.getState().pending).toHaveLength(1));
    controller.abort();
    expect((await running).isError).toBe(true);
    expect(useToolApprovalStore.getState().pending).toHaveLength(0);
  });

  it('returns no tools when Rust is unreachable', async () => {
    service.getTools.mockRejectedValue('boom');
    service.getConfig.mockResolvedValue({ mcpServers: {}, mcpSettings: DEFAULT_MCP_SETTINGS });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await loadMcpTools(new Set(), settings)).toEqual([]);
    spy.mockRestore();
  });
});

describe('loadMcpSettings', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reads the saved settings, with max tool calls as a whole number of at least one', async () => {
    service.getConfig.mockResolvedValue({ mcpServers: {}, mcpSettings: { ...DEFAULT_MCP_SETTINGS, maxToolCalls: 2.5 } });
    expect((await loadMcpSettings()).maxToolCalls).toBe(2);
    service.getConfig.mockResolvedValue({ mcpServers: {}, mcpSettings: { ...DEFAULT_MCP_SETTINGS, maxToolCalls: 0 } });
    expect((await loadMcpSettings()).maxToolCalls).toBe(1);
  });

  it('falls back to the defaults when the config cannot be read', async () => {
    service.getConfig.mockRejectedValue('boom');
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await loadMcpSettings()).toEqual(DEFAULT_MCP_SETTINGS);
    spy.mockRestore();
  });
});

describe('callToolFromScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useToolApprovalStore.setState({ pending: [] });
  });

  it("calls only its own server's tools, never a switched-off one, and returns the whole result", async () => {
    setup({ allowAllTools: true });
    const whole = { content: [{ type: 'text', text: 'contents' }] };
    service.callTool.mockResolvedValue({ text: 'contents', isError: false, result: whole });
    expect(await callToolFromScreen('fs', 'read_file', { path: 'a' }, new Set())).toEqual(whole);
    expect(await callToolFromScreen('other', 'read_file', {}, new Set())).toMatchObject({ isError: true });
    expect(await callToolFromScreen('fs', 'read_file', {}, new Set(['fs/read_file']))).toMatchObject({ isError: true });
    expect(service.callTool).toHaveBeenCalledTimes(1);
  });

  it('asks the same approval as the model, and a denial never runs the tool', async () => {
    setup();
    const pending = callToolFromScreen('fs', 'read_file', { path: 'a' }, new Set());
    await answerNextPrompt('deny');
    expect(await pending).toMatchObject({ isError: true });
    expect(service.callTool).not.toHaveBeenCalled();
  });
});
