import { describe, it, expect, vi } from 'vitest';
import { ToolRegistry } from '@extensions/tools/registry';

const makeTool = (name: string, overrides: Record<string, unknown> = {}) => ({
  name,
  description: `Test tool: ${name}`,
  parameters: {
    type: 'object' as const,
    properties: { query: { type: 'string' as const } },
    ...overrides,
  },
  execute: vi.fn(),
});

describe('ToolRegistry', () => {
  describe('register', () => {
    it('adds a tool successfully', () => {
      const registry = new ToolRegistry();
      const tool = makeTool('search');

      expect(() => registry.register(tool)).not.toThrow();
      expect(registry.getTool('search')).toBe(tool);
    });

    it('throws on duplicate tool name', () => {
      const registry = new ToolRegistry();
      registry.register(makeTool('search'));

      expect(() => registry.register(makeTool('search'))).toThrowError(
        '[ToolRegistry] Duplicate tool name: "search"',
      );
    });

    it('allows registering multiple tools with different names', () => {
      const registry = new ToolRegistry();
      registry.register(makeTool('search'));
      registry.register(makeTool('lookup'));
      registry.register(makeTool('list'));

      expect(registry.getToolNames()).toEqual(['search', 'lookup', 'list']);
    });
  });

  describe('getSchemas', () => {
    it('returns empty array when no tools registered', () => {
      const registry = new ToolRegistry();
      expect(registry.getSchemas()).toEqual([]);
    });

    it('returns schemas with name, description, and parameters only', () => {
      const registry = new ToolRegistry();
      const tool = makeTool('search');
      registry.register(tool);

      const schemas = registry.getSchemas();
      expect(schemas).toHaveLength(1);
      expect(schemas[0]).toEqual({
        name: 'search',
        description: 'Test tool: search',
        parameters: tool.parameters,
      });
    });

    it('does not include execute function in schemas', () => {
      const registry = new ToolRegistry();
      registry.register(makeTool('search'));

      const schemas = registry.getSchemas();
      expect(schemas[0]).not.toHaveProperty('execute');
    });

    it('returns schemas for all registered tools', () => {
      const registry = new ToolRegistry();
      registry.register(makeTool('alpha'));
      registry.register(makeTool('beta'));
      registry.register(makeTool('gamma'));

      const schemas = registry.getSchemas();
      expect(schemas).toHaveLength(3);
      expect(schemas.map(s => s.name)).toEqual(['alpha', 'beta', 'gamma']);
    });
  });

  describe('getTool', () => {
    it('returns the registered tool definition', () => {
      const registry = new ToolRegistry();
      const tool = makeTool('search');
      registry.register(tool);

      const result = registry.getTool('search');
      expect(result).toBe(tool);
      expect(result.execute).toBe(tool.execute);
    });

    it('throws for unknown tool name', () => {
      const registry = new ToolRegistry();
      expect(() => registry.getTool('nonexistent')).toThrowError(
        '[ToolRegistry] Unknown tool: "nonexistent"',
      );
    });

    it('throws for empty name', () => {
      const registry = new ToolRegistry();
      expect(() => registry.getTool('')).toThrowError(
        '[ToolRegistry] Unknown tool: ""',
      );
    });
  });

  describe('getToolNames', () => {
    it('returns empty array for fresh registry', () => {
      const registry = new ToolRegistry();
      expect(registry.getToolNames()).toEqual([]);
    });

    it('returns names in insertion order', () => {
      const registry = new ToolRegistry();
      registry.register(makeTool('charlie'));
      registry.register(makeTool('alpha'));
      registry.register(makeTool('bravo'));

      expect(registry.getToolNames()).toEqual(['charlie', 'alpha', 'bravo']);
    });

    it('returns a new array each call (not a reference to internal state)', () => {
      const registry = new ToolRegistry();
      registry.register(makeTool('a'));

      const names1 = registry.getToolNames();
      const names2 = registry.getToolNames();
      expect(names1).toEqual(names2);
      expect(names1).not.toBe(names2);
    });
  });

  describe('isolation', () => {
    it('separate registries are independent', () => {
      const reg1 = new ToolRegistry();
      const reg2 = new ToolRegistry();
      reg1.register(makeTool('tool-a'));
      reg2.register(makeTool('tool-b'));

      expect(reg1.getToolNames()).toEqual(['tool-a']);
      expect(reg2.getToolNames()).toEqual(['tool-b']);
      expect(() => reg1.getTool('tool-b')).toThrow();
    });
  });
});
