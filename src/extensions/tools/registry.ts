/**
 * Tool Registry
 *
 * Singleton collection of tool definitions. Provides lookup by name
 * and exports schemas for adapter → LLM consumption.
 */

import type { ToolDefinition, ToolSchema } from './types';

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();

  /** Register a tool definition. Throws on duplicate name. */
  register(tool: ToolDefinition): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`[ToolRegistry] Duplicate tool name: "${tool.name}"`);
    }
    this.tools.set(tool.name, tool);
  }

  /** Return schemas (name + description + parameters) for all registered tools. */
  getSchemas(): ToolSchema[] {
    return Array.from(this.tools.values()).map(({ name, description, parameters }) => ({
      name,
      description,
      parameters,
    }));
  }

  /** Look up a tool by name. Throws if not found. */
  getTool(name: string): ToolDefinition {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`[ToolRegistry] Unknown tool: "${name}"`);
    }
    return tool;
  }

  /** Return every registered definition (bridge input). */
  getTools(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /** Return all registered tool names. */
  getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }
}
