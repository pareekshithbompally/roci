/**
 * Tool Registry
 *
 * Singleton collection of the built-in tool definitions.
 */

import type { ToolDefinition } from './types';

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();

  /** Register a tool definition. Throws on duplicate name. */
  register(tool: ToolDefinition): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`[ToolRegistry] Duplicate tool name: "${tool.name}"`);
    }
    this.tools.set(tool.name, tool);
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
