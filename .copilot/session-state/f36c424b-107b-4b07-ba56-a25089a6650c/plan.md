# Plan: Todo Tool Improvements + Chat-Based Todo Creation

## Problem Statement

Four issues with the current todo/action items system:

1. **`get_action_items` tool missing reminder info**: The tool outputs `dueDate` but ignores `reminder` data (scheduled OS notifications) and `owner`. The LLM can't tell the user about reminders or who's assigned.

2. **No write capability via chat**: The orchestrator is purely read-only (classify → retrieve → synthesize). Users cannot say "create a todo to follow up with John by Friday" and have it persist. No `create_todo`, `update_todo`, or `toggle_todo` tool exists.

3. **Intent classifier doesn't recognize todo-creation requests**: The `action_items` intent is read-only. "Create a todo" still routes to `action_items` retrieval, which only reads.

4. **No user confirmation before writes**: LLM-extracted params (text, date, assignee) can be wrong. User must review and approve before anything hits the DB.

## Current Architecture

- **Orchestrator**: 3-step (classify → retrieve → synthesize). Synthesis has NO tool calling — only web search.
- **Tools**: All 8 tools are read-only (search, get, list).
- **TodosRepository**: Already has `addTodo()`, `updateTodo()`, `deleteTodo()`, `toggleTodo()` — ready for write operations.
- **TodoEntry type**: Has `reminder?: TodoReminder` field (with `dateTime` + `notificationId`).
- **ReminderService**: Exists at `services/reminder.service.ts` — can schedule/cancel OS notifications.
- **TodosContext**: Has `addTodo()`, `toggleTodo()`, `updateTodo()`, `deleteTodo()` — React-context-bound.
- **ChatContext**: Manages chat state. Has patterns for inline state (`deleteConfirmId`, `aiActivity`).
- **Chat UI**: `ChatPanel.tsx` + `ChatView.tsx` both render `<ChatInput />` at bottom. Banner would go between messages and input.
- **Existing confirmation patterns**: `DeleteConfirmModal` (AlertDialog), `UnsavedChangesModal` — both are modals, not inline banners.
- **Theme tokens**: `SURFACE`, `BORDER`, `TEXT`, `COMPONENT` — all available for consistent styling.

## Design

### End-to-End Flow (User's Perspective)

```
User types: "Remind me to eat dinner at Sao Paolo at 8 pm with Alex in 2 months"
                                    │
                            ┌───────▼────────┐
                            │  Step 1: LLM    │
                            │  Intent Classify │
                            └───────┬────────┘
                                    │ intent: manage_todos
                                    │ mutation: { action: create, text: "Dinner at Sao Paolo
                                    │   with Alex", due_date: "2026-05-27",
                                    │   reminder_datetime: "2026-05-27T20:00:00",
                                    │   owner: "Alex", is_general: true }
                            ┌───────▼────────┐
                            │  Step 2: RAG    │
                            │  Retrieval      │  (skipped if is_general)
                            └───────┬────────┘
                                    │
                            ┌───────▼────────┐
                            │  Step 2.5:      │
                            │  PROPOSE (not   │  ← NEW — does NOT write yet
                            │  execute)       │
                            └───────┬────────┘
                                    │ Returns TodoProposal to UI
                                    │
                   ┌────────────────▼────────────────────┐
                   │  CONFIRMATION BANNER (above input)   │
                   │                                      │
                   │  📝 Create todo:                     │
                   │  ┌─────────────────────────────┐     │
                   │  │ Dinner at Sao Paolo with... │ ✎   │  ← editable text
                   │  └─────────────────────────────┘     │
                   │  📅 May 27, 2026          ✎          │  ← editable date
                   │  🔔 8:00 PM               ✎          │  ← editable time
                   │  👤 Alex                  ✎          │  ← editable owner
                   │  📎 General (no meeting)  ✎          │  ← meeting picker
                   │                                      │
                   │  [Cancel]  [Create ✓]                │
                   └──────────┬───────────────────────────┘
                              │ User clicks "Create ✓" (or edits first)
                      ┌───────▼────────┐
                      │  Step 3:       │
                      │  COMMIT        │  ← Now writes to DB + schedules reminder
                      └───────┬────────┘
                              │
                      ┌───────▼────────┐
                      │  Step 4:       │
                      │  Synthesis     │  → "Done! I'll remind you May 27 at 8 PM..."
                      └───────┬────────┘
                              │
                      ┌───────▼────────┐
                      │  UI Refresh    │  → TodosContext reloads, todo appears
                      └────────────────┘
```

### Key Design Decisions

1. **Propose-then-commit**: The orchestrator does NOT write on mutation detection. It builds a `TodoProposal` and pauses. The UI shows a confirmation banner. Only after user approval does the write happen. The LLM does heavy lifting (parse NL → structured data), user is the final gate.

2. **Inline banner, not modal**: A modal blocks everything. A banner above the chat input is non-intrusive — user can still scroll messages, and the banner is always visible near where they typed.

3. **Inline editing**: Each field (text, date, time, owner, meeting) is editable directly in the banner. No secondary form or dialog. Click the edit icon → field becomes an input → edit → done.

4. **Zustand store for proposal state**: The `TodoProposal` lives in a lightweight Zustand store (`todoProposalStore`), not ChatContext. Reason: ChatContext is already 1000+ lines and proposal lifecycle is independent of chat sessions. The store is consumed by the banner component via `useSyncExternalStore`.

5. **Meeting resolution**: If user mentions a meeting ("from the standup"), RAG search resolves it to a meeting ID + title in Step 2. The banner shows the resolved meeting name with option to change.

6. **General todos**: `_general` virtual meeting ID for todos not tied to any meeting. Repository already handles arbitrary IDs.

7. **Fuzzy todo matching**: For toggle/update/delete, the mutation step loads the meeting's todos and fuzzy-matches by text. The proposal shows the matched todo for user confirmation.

### TodoProposal Type

```typescript
interface TodoProposal {
  id: string;                        // Unique proposal ID
  action: 'create' | 'toggle' | 'update' | 'delete';
  
  // Editable fields (user can modify before commit)
  text: string;                      // Todo text
  dueDate: string | null;            // ISO date (date only)
  reminderDateTime: string | null;   // ISO datetime (for OS notification)
  owner: string | null;              // Assignee(s)
  
  // Meeting linkage
  meetingId: string | null;          // Resolved meeting ID (null = _general)
  meetingTitle: string | null;       // Display name
  isGeneral: boolean;                // True if not linked to a meeting
  
  // For toggle/update/delete — the matched existing todo
  matchedTodoId: string | null;
  matchedTodoText: string | null;
  
  // State
  status: 'pending' | 'committed' | 'cancelled';
}
```

### todoProposalStore (Zustand-like External Store)

```typescript
// extensions/tools/stores/todoProposalStore.ts
// Pattern: matches streamingStore.ts — useSyncExternalStore compatible

interface TodoProposalStore {
  proposal: TodoProposal | null;
  
  // Called by orchestrator (Step 2.5)
  propose(proposal: TodoProposal): void;
  
  // Called by UI (banner buttons)
  updateField(field: keyof TodoProposal, value: unknown): void;
  commit(): Promise<void>;    // Writes to DB + schedules reminder
  cancel(): void;             // Clears proposal
  
  // useSyncExternalStore interface
  subscribe(listener: () => void): () => void;
  getSnapshot(): TodoProposal | null;
}
```

### Commit Flow (what happens when user clicks "Create ✓")

```
commit()
  ├── todosRepository.addTodo(meetingId, todoEntry)
  ├── if reminderDateTime → reminderService.schedule(...)
  ├── emit 'todo-mutation' event (for TodosContext refresh)
  ├── set proposal.status = 'committed'
  └── trigger synthesis callback → LLM confirms in chat
```

## Phases

### Phase 1: Improve `get_action_items` Tool Output

**Files:**
- `extensions/tools/definitions/get-action-items.tool.ts`

**Changes:**
- Add reminder info: `🔔 Reminder: Mar 28 at 9:00 AM` if `item.reminder?.dateTime` exists
- Add owner info: `(Assigned: John)` if `item.owner` exists
- Both in the formatted output string per item

### Phase 2: New Intent — `manage_todos`

**Files:**
- `extensions/tool-orchestrator/types.ts` — add `manage_todos` to `IntentType`, add `mutation` field
- `src/core/ai/prompts/chat.prompt.ts` — add intent #11 + examples + date resolution instructions
- `extensions/tool-orchestrator/intent-classifier.ts` — add to `VALID_INTENTS`

**Intent classifier prompt additions:**
```
11. **manage_todos** — CREATE, complete, update, or delete a todo/task/reminder. 
    User wants to WRITE data, not just read.

Decision rules (insert at priority 4, before action_items):
4a. Wants to CREATE/ADD/SET a todo/task/reminder → manage_todos
4b. Wants to COMPLETE/FINISH/MARK DONE a todo → manage_todos  
4c. Wants to DELETE/REMOVE a todo → manage_todos
4d. Wants to READ/LIST/CHECK action items → action_items

mutation field schema:
"mutation": {
  "action": "create" | "toggle" | "update" | "delete",
  "todo_text": "<the todo content, cleaned up>",
  "due_date": "<ISO 8601 date, resolved from today's date>" | null,
  "reminder_datetime": "<ISO 8601 datetime>" | null,
  "owner": "<person name(s)>" | null,
  "meeting_query": "<search terms to find the meeting>" | null,
  "is_general": true | false,
  "match_text": "<text to fuzzy-match existing todo>" | null
}

IMPORTANT: When user says "remind me", set reminder_datetime. 
Resolve relative dates using today's date (provided in system context).
"tomorrow at 5pm" → "2026-03-28T17:00:00"
"in 2 months" → "2026-05-27T00:00:00"
"next Friday" → compute from today's weekday
```

**New examples in prompt:**
```
User: "Create a todo to review the Q3 budget"
{"intent":"manage_todos","confidence":"high","mutation":{"action":"create","todo_text":"Review the Q3 budget","is_general":true},"depth":"none"}

User: "Remind me to call Sarah tomorrow at 3pm"  
{"intent":"manage_todos","confidence":"high","mutation":{"action":"create","todo_text":"Call Sarah","reminder_datetime":"2026-03-28T15:00:00","owner":"Sarah","is_general":true},"depth":"none"}

User: "I finished the competitor analysis from the marketing standup"
{"intent":"manage_todos","confidence":"high","search_query":"marketing standup","mutation":{"action":"toggle","match_text":"competitor analysis","meeting_query":"marketing standup"},"depth":"surface"}

User: "Add a follow-up todo to the product roadmap meeting — finalize OKRs with Mike by April 15"
{"intent":"manage_todos","confidence":"high","search_query":"product roadmap","mutation":{"action":"create","todo_text":"Finalize OKRs with Mike","due_date":"2026-04-15","owner":"Mike","meeting_query":"product roadmap"},"depth":"surface"}
```

### Phase 3: TodoProposal Store + manage_todo Tool

**New files:**
- `src/features/chat/stores/todoProposalStore.ts` — Zustand-like external store (matches `streamingStore.ts` pattern)
- `extensions/tools/definitions/manage-todo.tool.ts` — tool that builds proposals (does NOT write to DB)

**Also modify:**
- `extensions/tools/index.ts` — register `manageTodoTool`
- `extensions/tool-orchestrator/retrieval-executor.ts` — add `TOOL_LABELS` entry for `manage_todo`
- `extensions/tools/types.ts` — extend `ToolContext` with `scheduleReminder` callback

**TodoProposalStore details:**
- Non-React store using `useSyncExternalStore` pattern (same as `streamingStore.ts`)
- Holds one `TodoProposal | null` at a time
- `propose()` — set proposal (called by orchestrator)
- `updateField()` — inline edit from banner UI
- `commit()` — write to `todosRepository` + call `reminderService.schedule()` + emit refresh event
- `cancel()` — clear proposal, no write
- Store imports `todosRepository` and `reminderService` directly (they're singletons)

**manage_todo tool:**
- For `create`: Builds `TodoProposal` from params, calls `todoProposalStore.propose()`
- For `toggle`: Loads meeting todos, fuzzy-matches `match_text`, builds proposal with matched todo
- For `update`/`delete`: Same fuzzy-match flow
- Returns a confirmation string for synthesis: "Proposed: Create todo 'Call Sarah' — awaiting user confirmation"
- Does NOT write to DB — the store's `commit()` does that after user approval

**Fuzzy matching logic (for toggle/update/delete):**
- Load `todosRepository.readDoc(meetingId)`
- Score each todo against `match_text` using simple substring + word overlap
- Pick highest-scoring match
- If no match above threshold → return error "No matching todo found"
- Put matched todo in proposal for user to confirm

### Phase 4: Mutation Step in Orchestrator (Propose, Not Execute)

**Files:**
- `extensions/tool-orchestrator/retrieval-executor.ts` — add `executeMutateTodo()` for `manage_todos` intent
- `extensions/tool-orchestrator/index.ts` — add proposal step between retrieval and synthesis
- `extensions/tool-orchestrator/types.ts` — add `onProposal` callback to `OrchestratorCallbacks`

**Flow change in `orchestrate()`:**
```
Step 1: classifyIntent()
Step 2: executeRetrieval() — now also handles manage_todos:
  - If mutation.meeting_query → RAG search to resolve meeting ID
  - Calls manage_todo tool → builds TodoProposal → calls onProposal callback
Step 3: synthesisPhase() — runs immediately with proposal context
  - Synthesis says: "I've prepared a todo for you — please review above and confirm."
```

The orchestrator does NOT wait for user confirmation. It:
1. Proposes (sets store state)
2. Immediately synthesizes a message saying "review above"
3. The banner appears above chat input
4. User confirms → commit() writes to DB → UI refreshes
5. User cancels → proposal cleared, no write

This means synthesis and proposal happen in parallel — no blocking.

**`onProposal` callback:**
- Passed from `ChatContext.sendMessage()` into orchestrator options
- When called, sets `todoProposalStore.propose(proposal)`
- Banner component re-renders via `useSyncExternalStore`

### Phase 5: Confirmation Banner Component

**New files:**
- `src/features/chat/components/TodoConfirmationBanner.tsx` — the banner UI
- `src/features/chat/components/TodoConfirmationBanner.test.tsx` — tests

**Also modify:**
- `src/features/chat/components/ChatPanel.tsx` — render banner between messages and input
- `src/features/chat/components/ChatView.tsx` — same
- `src/features/chat/components/index.ts` — export new component

**Banner component design:**

```
┌─────────────────────────────────────────────────────┐
│  📝 New Todo                                    ╳   │  ← header + dismiss
│                                                     │
│  ┌───────────────────────────────────────────┐      │
│  │ Dinner at Sao Paolo with Alex             │  ✎  │  ← text (click ✎ to edit inline)
│  └───────────────────────────────────────────┘      │
│                                                     │
│  📅 May 27, 2026  ✎   🕐 8:00 PM  ✎               │  ← date + time (editable)
│  👤 Alex  ✎            📎 General  ✎               │  ← owner + meeting (editable)
│                                                     │
│  ┌─────────┐  ┌──────────────┐                      │
│  │ Cancel  │  │  Create ✓    │                      │  ← action buttons
│  └─────────┘  └──────────────┘                      │
└─────────────────────────────────────────────────────┘
```

**Component states:**
- `viewing`: Display parsed values, edit icons visible
- `editing-<field>`: One field is in edit mode (text becomes textarea, date becomes date picker, time becomes time input, owner becomes text input, meeting becomes dropdown)
- `committing`: Loading spinner on Create button, fields disabled
- `committed`: Brief success flash, then banner auto-dismisses
- `error`: Red border, error message, retry button

**Styling:**
- Container: `SURFACE.input` bg, `BORDER.default` border, `rounded-xl`, `p-4`
- Above chat input: rendered in `ChatPanel`/`ChatView` between messages scroll area and `<ChatInput />`
- Animate in: `animate-in slide-in-from-bottom-2` (or CSS transition)
- Animate out: fade + slide down on dismiss/commit
- Edit icons: `COMPONENT.toolbarButton` style (8×8 circle, hover highlight)
- Cancel: `COMPONENT.secondaryButton`
- Create: `COMPONENT.primaryButton`
- For toggle: header says "✅ Complete Todo", shows matched todo text
- For delete: header says "🗑 Delete Todo", red-tinted, Create becomes "Delete"

**Inline editing:**
- Click ✎ on a field → that field becomes an input
- Text: `<textarea>` with `COMPONENT.inlineInput` styling, auto-focus
- Date: `<input type="date">` 
- Time: `<input type="time">`
- Owner: `<input type="text">` 
- Meeting: `<select>` dropdown with recent meetings + "General (no meeting)" option
- Press Enter or click away → saves to proposal store via `updateField()`
- Only one field editable at a time

### Phase 6: General Todos Support

**Files:**
- `services/repositories/todos.repository.ts` — ensure `_general` dir auto-created on first write
- `extensions/tools/definitions/get-action-items.tool.ts` — include `_general` in retrieval scan
- `src/features/todos/context/TodosContext.tsx` — support loading general todos
- `src/features/todos/components/TodoList.tsx` — show general todos section

**Changes:**
- `todosRepository`: The `DocumentRepository` base class should auto-create dirs. Verify `_general` path works.
- `get_action_items`: When scanning all meetings, also check `_general` bucket. Add a special entry labeled "General" in output.
- TodoList: When viewing general todos, show under a "General" header. When viewing a meeting, only show that meeting's todos.

### Phase 7: UI Refresh After Commit

**Files:**
- `src/features/todos/context/TodosContext.tsx` — subscribe to mutation events
- `src/features/chat/stores/todoProposalStore.ts` — emit event on commit

**Approach:**
- `todoProposalStore.commit()` fires a custom event: `window.dispatchEvent(new CustomEvent('kasset:todo-mutation', { detail: { meetingId, action } }))`
- `TodosContext` subscribes in `useEffect`: `window.addEventListener('kasset:todo-mutation', handler)`
- Handler calls `loadTodos(meetingId)` to refresh from disk
- This matches the existing event bridge pattern used by RAG progress events

## Verification Checklist

### Phase 1
- [ ] "What are my action items?" → reminder info + owner in LLM response
- [ ] Items with no reminder show no indicator (clean output)

### Phase 2
- [ ] "Create a todo to call John" → classified as `manage_todos`
- [ ] "Mark the API task done" → classified as `manage_todos` with `action: toggle`
- [ ] "What are my pending todos?" → still classified as `action_items` (read)
- [ ] "Remind me at 5pm tomorrow" → `reminder_datetime: "2026-03-28T17:00:00"`

### Phase 3
- [ ] `todoProposalStore.propose()` sets proposal state
- [ ] `todoProposalStore.commit()` writes to todosRepository
- [ ] `todoProposalStore.cancel()` clears without writing
- [ ] Fuzzy match finds "competitor analysis" from "I finished the competitor analysis"

### Phase 4
- [ ] Orchestrator calls `onProposal` callback with TodoProposal
- [ ] Synthesis streams "I've prepared a todo — review above"
- [ ] Banner appears while synthesis is streaming

### Phase 5
- [ ] Banner renders above chat input in both ChatPanel and ChatView
- [ ] All 5 fields are inline-editable
- [ ] Cancel clears banner without DB write
- [ ] Create commits to DB + schedules reminder
- [ ] Banner animates in/out smoothly
- [ ] Banner disabled during commit (loading state)
- [ ] Toggle variant shows matched todo text
- [ ] Delete variant has destructive styling

### Phase 6
- [ ] General todos stored at `meetings/_general/todos.json`
- [ ] "Remind me to buy groceries" creates general todo
- [ ] `get_action_items` includes general todos
- [ ] UI shows general todos in todo panel

### Phase 7
- [ ] Create todo via chat → TodosContext reloads → UI updates immediately
- [ ] Toggle todo via chat → completion status updates in UI
- [ ] No full-page refresh needed

## Example Traces (Proof the Plan Works)

### E1: Meeting-linked todo with reminder
> "Remind me to send the proposal to Sarah before the next board meeting — she mentioned it in last week's strategy sync"

- **Step 1**: `manage_todos`, `mutation: { action: create, text: "Send proposal to Sarah before board meeting", owner: "Sarah", meeting_query: "strategy sync last week" }`
- **Step 2**: RAG finds "Strategy Sync — Mar 20" (id: abc-123)
- **Step 2.5**: Proposal: `{ text: "Send proposal to Sarah...", meetingId: "abc-123", meetingTitle: "Strategy Sync — Mar 20", owner: "Sarah", reminderDateTime: null }`
- **Banner**: Shows parsed todo. User sees meeting is correctly linked. No reminder time — user can add one via ✎ on the 🔔 field, or just create without reminder.
- **User clicks Create ✓**: Writes to `meetings/abc-123/todos.json`
- **Synthesis**: "Added to **Strategy Sync — Mar 20**: *Send proposal to Sarah*"

### E2: Personal reminder with exact time
> "Remind me to pick up dry cleaning tomorrow at 5:30 pm"

- **Step 1**: `manage_todos`, `mutation: { action: create, text: "Pick up dry cleaning", reminder_datetime: "2026-03-28T17:30:00", due_date: "2026-03-28", is_general: true }`
- **Step 2**: Skipped (is_general, depth: none)
- **Step 2.5**: Proposal: `{ text: "Pick up dry cleaning", dueDate: "2026-03-28", reminderDateTime: "2026-03-28T17:30:00", isGeneral: true }`
- **Banner**: Shows all fields. User confirms.
- **Commit**: Writes to `meetings/_general/todos.json` + `reminderService.schedule()` → OS notification at 5:30 PM
- **Synthesis**: "Done! 🔔 I'll remind you tomorrow at 5:30 PM to pick up dry cleaning."

### E3: Meeting action item with due date
> "Add a follow-up todo to the product roadmap meeting — finalize Q3 OKRs with Mike by April 15"

- **Step 1**: `manage_todos`, `mutation: { action: create, text: "Finalize Q3 OKRs with Mike", due_date: "2026-04-15", owner: "Mike", meeting_query: "product roadmap" }`
- **Step 2**: RAG finds "Product Roadmap Review" (id: def-456)
- **Step 2.5**: Proposal with resolved meeting
- **Banner**: User sees meeting correctly resolved, verifies date April 15. Clicks Create.
- **Commit**: Writes to `meetings/def-456/todos.json`

### E4: Toggle existing todo via chat
> "I finished the competitor analysis from the marketing standup, mark it done"

- **Step 1**: `manage_todos`, `mutation: { action: toggle, match_text: "competitor analysis", meeting_query: "marketing standup" }`
- **Step 2**: RAG finds "Marketing Standup" (id: ghi-789). Loads its todos.
- **Step 2.5**: Fuzzy matches "competitor analysis" → finds `{ id: "todo-42", text: "Complete competitor analysis report" }`. Proposal: `{ action: toggle, matchedTodoId: "todo-42", matchedTodoText: "Complete competitor analysis report" }`
- **Banner**: "✅ Complete Todo: *Complete competitor analysis report* from Marketing Standup" — [Cancel] [Mark Done ✓]
- **Commit**: `todosRepository.toggleTodo("ghi-789", "todo-42")`

### E5: Complex personal reminder
> "Remind me to eat dinner at Sao Paolo at 8 pm with Alex and Jamie in 2 months"

- **Step 1**: `manage_todos`, `mutation: { action: create, text: "Dinner at Sao Paolo with Alex and Jamie", due_date: "2026-05-27", reminder_datetime: "2026-05-27T20:00:00", owner: "Alex, Jamie", is_general: true }`
- **Step 2**: Skipped
- **Step 2.5**: Proposal with all fields populated
- **Banner**: User verifies "May 27, 2026" is correct (2 months from now). Verifies 8:00 PM. Sees owner "Alex, Jamie". Can edit any field. Clicks Create.
- **Commit**: Writes to `_general` + schedules OS notification for May 27 at 8 PM
- **Synthesis**: "All set! 🔔 Reminder for May 27 at 8:00 PM — dinner at Sao Paolo with Alex and Jamie."

## Notes

- Intent classifier extracts all structured params from natural language in Step 1 — no extra LLM call for parsing.
- Today's date must be injected into the classifier system prompt so it can resolve relative dates.
- `manage_todo` tool never throws — returns `ToolResult` with `isError`.
- Only one proposal can be active at a time. If user sends another manage_todos message while a banner is showing, the old proposal is auto-cancelled.
- `_general` meeting ID is excluded from `list_meetings` and `search_meetings` tools.
- The banner disables the chat input while visible (or dims it) to focus attention on the confirmation.
- Keyboard shortcut: Enter to confirm, Escape to cancel (when banner is focused).
