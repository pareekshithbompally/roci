# Phase 1 — Foundation

> Goal: Define tool types, build the tool registry and executor, implement all tool definitions, extend the Model type with `supportsTools`. Everything testable in isolation — no UI changes, no orchestrator, no adapter changes.

---

## 1.1 Tool Type System

**File: `extensions/tools/types.ts`**

Define the common interfaces that all tools, the registry, the executor, and the orchestrator will use. These are provider-agnostic — adapters translate to/from these.

### ToolDefinition

```typescript
interface ToolDefinition {
  name: string;                            // "search_meetings"
  description: string;                     // Shown to LLM as tool description
  parameters: JSONSchema;                  // JSON Schema for input validation
  execute: (params: any, context: ToolContext) => Promise<ToolResult>;
}
```

- `name`: Unique identifier. Snake_case. Must match what adapters send to providers.
- `description`: Clear, concise. The LLM reads this to decide whether to call the tool. Quality matters — bad descriptions = bad tool selection.
- `parameters`: Standard JSON Schema object. Each adapter converts this to its provider's format (Anthropic `input_schema`, OpenAI `parameters`, Gemini `parameters`).
- `execute`: The actual implementation. Receives validated params + context.

### ToolContext

```typescript
interface ToolContext {
  historyItems: HistoryItem[];             // All meetings (for lookup)
  signal?: AbortSignal;                    // For cancellation during tool execution
}
```

Passed by the orchestrator so tools have access to meeting data and can respect abort signals. Keep this minimal — tools should not know about LLM adapters, providers, or chat sessions.

### ToolCall (from LLM response)

```typescript
interface ToolCall {
  id: string;                              // Provider-assigned ID (for result matching)
  name: string;                            // Tool name
  arguments: Record<string, unknown>;      // Parsed arguments
}
```

This is what the adapter emits when it detects the LLM wants to call a tool. Provider-agnostic — each adapter parses its format into this.

### ToolResult (from executor)

```typescript
interface ToolResult {
  toolCallId: string;                      // Matches ToolCall.id
  content: string;                         // Stringified result for LLM consumption
  isError: boolean;                        // If true, content is an error message
  meta?: {                                 // For UI display (not sent to LLM)
    toolName: string;
    executionMs: number;
    resultCount?: number;                  // e.g., "Found 3 meetings"
  };
}
```

- `content` is always a string. The LLM consumes it as text. Structured data (meeting objects, search results) gets formatted into readable text.
- `isError`: When true, the LLM receives the error and can decide how to respond (retry with different params, apologize, etc.). We do NOT crash the chat on tool errors.
- `meta`: UI-only. The orchestrator uses this for activity indicators. Never sent to the LLM.

---

## 1.2 Tool Registry

**File: `extensions/tools/registry.ts`**

A simple collection that holds all tool definitions and provides lookup.

### Responsibilities

1. Register tool definitions at app startup
2. Return tool schemas (for adapter → LLM) as a plain array of `{ name, description, parameters }`
3. Look up tools by name (for executor)
4. Validate that tool names are unique

### Design

- Singleton pattern (like the existing `contextPipeline` export)
- Initialized in `extensions/tools/index.ts` where all tools are registered
- No provider-specific logic. Just a collection.

### API Surface

```
registry.register(tool: ToolDefinition): void
registry.getSchemas(): ToolSchema[]              // name + description + parameters (no execute fn)
registry.getTool(name: string): ToolDefinition   // throws if not found
registry.getToolNames(): string[]
```

### Entry Point

**File: `extensions/tools/index.ts`**

```
import { ToolRegistry } from './registry';
import { searchMeetingsTool } from './definitions/search-meetings.tool';
import { getMeetingTool } from './definitions/get-meeting.tool';
import { listMeetingsTool } from './definitions/list-meetings.tool';
import { getActionItemsTool } from './definitions/get-action-items.tool';

export const toolRegistry = new ToolRegistry();
toolRegistry.register(searchMeetingsTool);
toolRegistry.register(getMeetingTool);
toolRegistry.register(listMeetingsTool);
toolRegistry.register(getActionItemsTool);
```

---

## 1.3 Tool Executor

**File: `extensions/tools/executor.ts`**

Runs a tool by name with given arguments. Wraps the registry lookup + execution + error handling + timing.

### Responsibilities

1. Look up tool in registry
2. Validate arguments against JSON schema (basic — reject missing required fields)
3. Execute with try/catch
4. Return `ToolResult` (with timing metadata)
5. On error: return `ToolResult` with `isError: true` and human-readable error message

### API Surface

```
executor.execute(call: ToolCall, context: ToolContext): Promise<ToolResult>
```

### Error Handling Strategy

Tool execution errors are **non-fatal**. The executor catches all errors and returns them as `ToolResult { isError: true, content: "Error: ..." }`. The orchestrator feeds this back to the LLM, which can:
- Retry with different parameters
- Respond without the tool's data
- Tell the user it couldn't retrieve the information

This is critical: **a tool failure must never crash the chat**.

---

## 1.4 Tool Definitions

Each tool is a separate file in `extensions/tools/definitions/`. Each exports a `ToolDefinition`.

### search_meetings

**File: `extensions/tools/definitions/search-meetings.tool.ts`**

Wraps the existing `ragSearcher.search()` from `extensions/rag/`.

**Parameters:**
- `query` (string, required): Search query
- `limit` (number, optional, default 5): Max results

**Execution:**
1. Ensure vectordb is initialized
2. Ensure meetings are indexed (reuse `ragIndexer.needsReindex()` + `indexAll()`)
3. Call `ragSearcher.search(query, { limit, mode: 'hybrid' })`
4. Format results as readable text:
   ```
   Found 3 relevant meetings:

   1. "Strategy Session for Q3" (2026-02-10)
      Relevance: high | Match: "discussed database migration timeline..."
      Meeting ID: abc123

   2. "Tech Architecture Review" (2026-02-05)
      Relevance: medium | Match: "considered PostgreSQL vs MongoDB..."
      Meeting ID: def456
   ```

**Why this format**: The LLM can read the snippets to decide which meetings to load in full. The meeting IDs let it call `get_meeting` for details.

**Dependencies:** `ragSearcher`, `ragIndexer`, `vectorDB` from `extensions/rag/`

### get_meeting

**File: `extensions/tools/definitions/get-meeting.tool.ts`**

Wraps the existing `meetingReferenceService.loadSelectiveContext()`.

**Parameters:**
- `meeting_id` (string, required): Meeting ID
- `fields` (array of strings, required): Which fields to load. Enum: `["summary", "transcript", "notes", "actionItems"]`

**Execution:**
1. Find the meeting in `context.historyItems` by ID
2. Call `meetingReferenceService.loadSelectiveContext([meeting], fields)`
3. Call `meetingReferenceService.formatForLLM(references)`
4. Return the formatted text

**Error cases:**
- Meeting ID not found → "Meeting not found with ID: {id}"
- Empty fields array → "At least one field must be specified"

**Dependencies:** `meetingReferenceService`

### list_meetings

**File: `extensions/tools/definitions/list-meetings.tool.ts`**

Simple listing of recent meetings for browsing.

**Parameters:**
- `count` (number, optional, default 10): How many recent meetings

**Execution:**
1. Take the last N items from `context.historyItems`, sorted by date
2. Format as a list:
   ```
   Recent meetings (showing 5 of 23):

   1. "Strategy Session for Q3" — 2026-02-10 — ID: abc123
   2. "Tech Architecture Review" — 2026-02-05 — ID: def456
   3. "Sprint Retrospective" — 2026-01-28 — ID: ghi789
   ```

**Dependencies:** None beyond the context.

### get_action_items

**File: `extensions/tools/definitions/get-action-items.tool.ts`**

Retrieves action items / todos from meetings.

**Parameters:**
- `meeting_id` (string, optional): If provided, get action items from this meeting only. If omitted, get from all meetings.
- `status` (string, optional, enum: "pending" | "completed" | "all", default "all"): Filter by status

**Execution:**
1. If `meeting_id`: find that meeting, extract action items
2. If no `meeting_id`: iterate recent meetings, collect action items
3. Format with status indicators and meeting attribution:
   ```
   Action Items (3 pending, 2 completed):

   From "Strategy Session for Q3" (2026-02-10):
   - [ ] Define primary KPIs for each department (Due: Feb 20)
   - [x] Send meeting notes to all attendees

   From "Tech Architecture Review" (2026-02-05):
   - [ ] Evaluate PostgreSQL 17 features
   ```

**Dependencies:** `meetingReferenceService` for loading meeting data.

---

## 1.5 Model Configuration Extension

### Type Change

**File: `types/modelProviders.ts`**

Extend the `Model` type:

```typescript
export type Model = {
  id: string;
  model?: string;
  name?: string;
  displayName?: string;
  version?: number | string;
  description?: string;
  format?: string;
  capabilities?: string[];
  settings?: Record<string, ProviderSetting>;
  // NEW:
  toolsEnabled?: boolean;       // Per-model tool calling toggle
}
```

### Default Values

- **Remote managed providers** (openai, anthropic, gemini): `toolsEnabled` defaults to `true` in the hardcoded model definitions in `consts/providers.ts`. User can override.
- **OpenAI-compat providers** (azure, groq, openrouter, etc.): `toolsEnabled` defaults to `true`. Most support it.
- **llamacpp local models**: `toolsEnabled` defaults to `false`. User opts in via settings modal.
- **Unset / undefined**: Treated as `false` (safe default).

### Resolver Helper

**File: `src/shared/utils/modelResolver.ts`**

Add helper:

```
export function supportsTools(resolved: ResolvedModel): boolean {
  return resolved.model.toolsEnabled === true;
}
```

This is what the ChatContext checks to decide whether to use the ToolOrchestrator or the direct adapter path.

### Persistence

The `toolsEnabled` flag lives on the `Model` object inside the provider's `models` array. When the user toggles it in the settings modal, it's persisted via the existing `SettingsContext.updateProvider()` flow — the entire provider config (including models with their settings) gets saved to storage.

---

## 1.6 Testing Strategy (Phase 1)

Since there's no UI or orchestrator yet, test tools via:

1. **Unit tests** (if test framework exists): Import each tool, call `execute()` with mock context, verify output format.
2. **Console verification**: Temporarily add a test button in dev mode that calls `toolExecutor.execute()` and logs results.
3. **Verify tool schemas**: Log `toolRegistry.getSchemas()` and manually verify they're valid JSON Schema.

### Acceptance Criteria

- [ ] All 4 tools execute correctly against real vectordb data
- [ ] Tool errors return `ToolResult { isError: true }`, never throw
- [ ] `toolRegistry.getSchemas()` returns valid schemas
- [ ] `Model.toolsEnabled` persists across app restarts
- [ ] `supportsTools()` resolver works correctly

---

## 1.7 Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Tool result format | Always string | LLMs consume text. Structured data formatted as readable text. |
| Error handling | Return as ToolResult, never throw | LLM can reason about errors and respond gracefully. |
| Schema format | JSON Schema | Industry standard. All providers accept it. |
| Default toolsEnabled | false for local, true for remote | Safe default. Users opt in for local. |
| Tool context | Minimal (historyItems + signal) | Tools don't need to know about adapters or providers. |
| Indexing in tools | search_meetings ensures indexed | Lazy — only indexes when a search actually happens. |

---

## Dependencies Map

```
extensions/tools/types.ts          <-- no dependencies
extensions/tools/registry.ts       <-- depends on: types.ts
extensions/tools/executor.ts       <-- depends on: types.ts, registry.ts
extensions/tools/definitions/*.ts  <-- depends on: types.ts, extensions/rag/*, services/meetingReferenceService
extensions/tools/index.ts          <-- depends on: registry.ts, definitions/*.ts

types/modelProviders.ts            <-- standalone type change
src/shared/utils/modelResolver.ts  <-- depends on: types/modelProviders.ts
```

No circular dependencies. No adapter or UI dependencies. Clean foundation.
