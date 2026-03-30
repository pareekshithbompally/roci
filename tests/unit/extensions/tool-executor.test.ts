import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToolExecutor } from '@extensions/tools/executor';
import { ToolRegistry } from '@extensions/tools/registry';
import { MAX_TOOL_RESULT_CHARS, TOOL_TIMEOUT_MS } from '@extensions/tools/constants';
import type { ToolCall, ToolContext, ToolResult } from '@extensions/tools/types';

const makeCall = (overrides: Partial<ToolCall> = {}): ToolCall => ({
  id: 'call-1',
  name: 'search',
  arguments: { query: 'test' },
  ...overrides,
});

const makeContext = (overrides: Partial<ToolContext> = {}): ToolContext => ({
  historyItems: [],
  ...overrides,
});

const makeTool = (name: string, executeFn?: (...args: unknown[]) => Promise<ToolResult>, required?: string[]) => ({
  name,
  description: `Tool: ${name}`,
  parameters: {
    type: 'object' as const,
    properties: { query: { type: 'string' as const } },
    ...(required && { required }),
  },
  execute: executeFn ?? vi.fn().mockResolvedValue({ content: 'ok', isError: false }),
});

describe('ToolExecutor', () => {
  let registry: ToolRegistry;
  let executor: ToolExecutor;

  beforeEach(() => {
    registry = new ToolRegistry();
    executor = new ToolExecutor(registry);
  });

  describe('unknown tool', () => {
    it('returns error result for unknown tool (never throws)', async () => {
      const result = await executor.execute(makeCall({ name: 'nonexistent' }), makeContext());

      expect(result.isError).toBe(true);
      expect(result.content).toBe('Error: Unknown tool "nonexistent"');
      expect(result.toolCallId).toBe('call-1');
      expect(result.meta?.toolName).toBe('nonexistent');
    });
  });

  describe('required parameter validation', () => {
    it('returns error when required parameter is missing', async () => {
      registry.register(makeTool('search', undefined, ['query']));
      const call = makeCall({ arguments: {} });

      const result = await executor.execute(call, makeContext());

      expect(result.isError).toBe(true);
      expect(result.content).toBe('Error: Missing required parameter "query"');
      expect(result.meta?.toolName).toBe('search');
    });

    it('returns error when required parameter is null', async () => {
      registry.register(makeTool('search', undefined, ['query']));
      const call = makeCall({ arguments: { query: null } });

      const result = await executor.execute(call, makeContext());

      expect(result.isError).toBe(true);
      expect(result.content).toContain('Missing required parameter "query"');
    });

    it('returns error for first missing required param when multiple are required', async () => {
      const tool = {
        name: 'multi',
        description: 'multi-param tool',
        parameters: {
          type: 'object' as const,
          properties: {
            a: { type: 'string' as const },
            b: { type: 'string' as const },
          },
          required: ['a', 'b'],
        },
        execute: vi.fn(),
      };
      registry.register(tool);
      const call = makeCall({ name: 'multi', arguments: { b: 'present' } });

      const result = await executor.execute(call, makeContext());

      expect(result.isError).toBe(true);
      expect(result.content).toBe('Error: Missing required parameter "a"');
    });

    it('passes when no required params are defined', async () => {
      registry.register(makeTool('search'));
      const call = makeCall({ arguments: {} });

      const result = await executor.execute(call, makeContext());

      expect(result.isError).toBe(false);
    });
  });

  describe('abort signal', () => {
    it('returns cancellation error when signal is already aborted', async () => {
      registry.register(makeTool('search'));
      const controller = new AbortController();
      controller.abort();

      const result = await executor.execute(makeCall(), makeContext({ signal: controller.signal }));

      expect(result.isError).toBe(true);
      expect(result.content).toBe('Error: Operation was cancelled');
      expect(result.toolCallId).toBe('call-1');
    });

    it('does not call execute when signal is aborted', async () => {
      const executeFn = vi.fn();
      registry.register(makeTool('search', executeFn));
      const controller = new AbortController();
      controller.abort();

      await executor.execute(makeCall(), makeContext({ signal: controller.signal }));

      expect(executeFn).not.toHaveBeenCalled();
    });
  });

  describe('successful execution', () => {
    it('returns result with timing metadata', async () => {
      const executeFn = vi.fn().mockResolvedValue({ content: 'found 3 results', isError: false });
      registry.register(makeTool('search', executeFn));

      const result = await executor.execute(makeCall(), makeContext());

      expect(result.isError).toBe(false);
      expect(result.content).toBe('found 3 results');
      expect(result.toolCallId).toBe('call-1');
      expect(result.meta?.toolName).toBe('search');
      expect(result.meta?.executionMs).toBeGreaterThanOrEqual(0);
    });

    it('passes arguments and context to tool execute', async () => {
      const executeFn = vi.fn().mockResolvedValue({ content: 'ok', isError: false });
      registry.register(makeTool('search', executeFn));
      const context = makeContext({ historyItems: [{ id: 'meeting-1' } as any] });
      const call = makeCall({ arguments: { query: 'revenue' } });

      await executor.execute(call, context);

      expect(executeFn).toHaveBeenCalledWith({ query: 'revenue' }, context);
    });

    it('preserves meta from tool result and adds toolName and executionMs', async () => {
      const executeFn = vi.fn().mockResolvedValue({
        content: 'ok',
        isError: false,
        meta: { resultCount: 5, citations: [] },
      });
      registry.register(makeTool('search', executeFn));

      const result = await executor.execute(makeCall(), makeContext());

      expect(result.meta?.resultCount).toBe(5);
      expect(result.meta?.citations).toEqual([]);
      expect(result.meta?.toolName).toBe('search');
      expect(result.meta?.executionMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('result truncation', () => {
    it('does not truncate results within limit', async () => {
      const content = 'x'.repeat(MAX_TOOL_RESULT_CHARS);
      const executeFn = vi.fn().mockResolvedValue({ content, isError: false });
      registry.register(makeTool('search', executeFn));

      const result = await executor.execute(makeCall(), makeContext());

      expect(result.content).toBe(content);
    });

    it('truncates results exceeding MAX_TOOL_RESULT_CHARS', async () => {
      const content = 'x'.repeat(MAX_TOOL_RESULT_CHARS + 500);
      const executeFn = vi.fn().mockResolvedValue({ content, isError: false });
      registry.register(makeTool('search', executeFn));

      const result = await executor.execute(makeCall(), makeContext());

      expect(result.content.startsWith('x'.repeat(MAX_TOOL_RESULT_CHARS))).toBe(true);
      expect(result.content).toContain('[Result truncated. Ask for specific sections if you need more detail.]');
      expect(result.content.length).toBeLessThan(content.length);
    });

    it('truncated result starts with exactly MAX_TOOL_RESULT_CHARS of original content', async () => {
      const content = 'abcdefghij'.repeat(1000);
      const executeFn = vi.fn().mockResolvedValue({ content, isError: false });
      registry.register(makeTool('search', executeFn));

      const result = await executor.execute(makeCall(), makeContext());

      const truncatedContent = result.content.split('\n\n[Result truncated')[0];
      expect(truncatedContent).toBe(content.slice(0, MAX_TOOL_RESULT_CHARS));
    });
  });

  describe('error handling', () => {
    it('catches execution errors and returns error result', async () => {
      const executeFn = vi.fn().mockRejectedValue(new Error('Database connection failed'));
      registry.register(makeTool('search', executeFn));

      const result = await executor.execute(makeCall(), makeContext());

      expect(result.isError).toBe(true);
      expect(result.content).toBe('Error executing search: Database connection failed');
      expect(result.meta?.toolName).toBe('search');
      expect(result.meta?.executionMs).toBeGreaterThanOrEqual(0);
    });

    it('handles non-Error thrown values', async () => {
      const executeFn = vi.fn().mockRejectedValue('string error');
      registry.register(makeTool('search', executeFn));

      const result = await executor.execute(makeCall(), makeContext());

      expect(result.isError).toBe(true);
      expect(result.content).toBe('Error executing search: string error');
    });

    it('handles timeout-like errors from tool execution', async () => {
      const executeFn = vi.fn().mockRejectedValue(
        new Error(`Tool "search" timed out after ${TOOL_TIMEOUT_MS / 1000}s`),
      );
      registry.register(makeTool('search', executeFn));

      const result = await executor.execute(makeCall(), makeContext());

      expect(result.isError).toBe(true);
      expect(result.content).toContain('timed out');
      expect(result.toolCallId).toBe('call-1');
    });
  });

  describe('toolCallId consistency', () => {
    it('always sets toolCallId from call.id on success', async () => {
      const executeFn = vi.fn().mockResolvedValue({ content: 'ok', isError: false });
      registry.register(makeTool('search', executeFn));
      const call = makeCall({ id: 'custom-id-123' });

      const result = await executor.execute(call, makeContext());

      expect(result.toolCallId).toBe('custom-id-123');
    });

    it('always sets toolCallId from call.id on error', async () => {
      const call = makeCall({ id: 'err-id', name: 'nope' });
      const result = await executor.execute(call, makeContext());

      expect(result.toolCallId).toBe('err-id');
    });

    it('overrides toolCallId from tool result with call.id', async () => {
      const executeFn = vi.fn().mockResolvedValue({
        content: 'ok',
        isError: false,
        toolCallId: 'wrong-id',
      });
      registry.register(makeTool('search', executeFn));

      const result = await executor.execute(makeCall({ id: 'correct-id' }), makeContext());

      expect(result.toolCallId).toBe('correct-id');
    });
  });

  describe('timing metadata', () => {
    it('includes executionMs on successful execution', async () => {
      const executeFn = vi.fn().mockResolvedValue({ content: 'ok', isError: false });
      registry.register(makeTool('search', executeFn));

      const result = await executor.execute(makeCall(), makeContext());

      expect(typeof result.meta?.executionMs).toBe('number');
      expect(result.meta!.executionMs).toBeGreaterThanOrEqual(0);
    });

    it('includes executionMs on unknown tool error', async () => {
      const result = await executor.execute(makeCall({ name: 'bad' }), makeContext());

      expect(typeof result.meta?.executionMs).toBe('number');
    });

    it('includes executionMs on execution error', async () => {
      const executeFn = vi.fn().mockRejectedValue(new Error('fail'));
      registry.register(makeTool('search', executeFn));

      const result = await executor.execute(makeCall(), makeContext());

      expect(typeof result.meta?.executionMs).toBe('number');
    });
  });
});
