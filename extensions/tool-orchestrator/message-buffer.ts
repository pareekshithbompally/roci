/**
 * Message Buffer
 *
 * Ephemeral buffer for a single tool-calling orchestration turn.
 * Tracks the conversation messages plus accumulated tool call/result
 * pairs during the multi-turn loop. Discarded after orchestration completes.
 */

import type { ChatMessage } from '@/types';
import type { ToolMessage } from '@/services/adapters/types';
import type { ToolCall, ToolResult } from '@extensions/tools/types';

export class MessageBuffer {
  private toolMessages: ToolMessage[] = [];

  constructor(private readonly conversationMessages: ChatMessage[]) {}

  /** The original conversation messages (read-only). */
  getMessages(): ChatMessage[] {
    return this.conversationMessages;
  }

  /** Tool call/result pairs accumulated during this orchestration turn. */
  getToolMessages(): ToolMessage[] {
    return this.toolMessages;
  }

  /** Record that the assistant requested tool calls. */
  addAssistantToolCalls(calls: ToolCall[], textBefore?: string): void {
    this.toolMessages.push({ role: 'assistant_tool_call', toolCalls: calls, textBefore });
  }

  /** Record tool execution results. */
  addToolResults(results: ToolResult[]): void {
    this.toolMessages.push({ role: 'tool_result', results });
  }

  /** Return metadata about tool calls made during this turn (for the final message). */
  getToolCallHistory(): { totalCalls: number; toolNames: string[] } {
    const allCalls = this.toolMessages
      .filter((m): m is Extract<ToolMessage, { role: 'assistant_tool_call' }> => m.role === 'assistant_tool_call')
      .flatMap(m => m.toolCalls);

    return {
      totalCalls: allCalls.length,
      toolNames: [...new Set(allCalls.map(c => c.name))],
    };
  }

  /** Whether any tool calls have been accumulated. */
  hasToolMessages(): boolean {
    return this.toolMessages.length > 0;
  }
}
