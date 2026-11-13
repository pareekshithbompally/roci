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

import { loadMcpTools } from '@extensions/tools/mcp-tools';
import { useToolApprovalStore } from '@shared/stores/toolApprovalStore';

const TOOL = { name: 'read_file', description: 'Read a file', inputSchema: { type: 'object', properties: { path: { type: 'string' } } }, server: 'fs', destructive: false };
const ctx = { historyItems: [] };

function setup(settings: Partial<McpSettings> = {}) {
  const config = { mcpServers: {}, mcpSettings: { ...DEFAULT_MCP_SETTINGS, ...settings } };
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
    const defs = await loadMcpTools(new Set(['search_meetings']));
    expect(defs.map((d) => d.name)).toEqual(['read_file']);
    expect(defs[0]).toMatchObject({ description: 'Read a file', timeoutMs: null, maxResultChars: null });
    expect(defs[0].parameters.type).toBe('object');
  });

  it('drops tools the user switched off and tags the rest with their server', async () => {
    setup();
    const defs = await loadMcpTools(new Set(['search_meetings']), new Set(['fs/read_file']));
    expect(defs).toEqual([]);
    const [def] = await loadMcpTools(new Set());
    expect(def.source).toBe('fs');
  });

  it('runs without asking when all tools are allowed', async () => {
    setup({ allowAllTools: true });
    const [def] = await loadMcpTools(new Set());
    const result = await def.execute({ path: '/a' }, ctx);
    expect(result).toMatchObject({ content: 'contents', isError: false });
    expect(service.callTool).toHaveBeenCalledWith(expect.objectContaining({ server: 'fs', tool: 'read_file', arguments: { path: '/a' } }));
  });

  it('asks, and a denial never reaches the server', async () => {
    setup();
    const [def] = await loadMcpTools(new Set());
    const running = def.execute({}, ctx);
    await answerNextPrompt('deny');
    expect((await running).isError).toBe(true);
    expect(service.callTool).not.toHaveBeenCalled();
  });

  it('"always allow" persists the server and skips later prompts this turn', async () => {
    setup();
    const [def] = await loadMcpTools(new Set());
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
    const [def] = await loadMcpTools(new Set());
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
    expect(await loadMcpTools(new Set())).toEqual([]);
    spy.mockRestore();
  });
});
