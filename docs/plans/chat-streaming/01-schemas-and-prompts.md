# Phase 1 — Schemas, Prompts & Request Builders

## Objective

Create a single source of truth for all LLM schemas, prompts, and request configuration. Nothing is hardcoded in service files. Everything is imported from `src/core/ai/`. Prompt and schema are always built together as a coupled pair — impossible to get one without the other.

## New File Structure

```
src/core/ai/
├── schemas/
│   ├── chat.schema.ts          # Chat response schema (response + suggestions + title)
│   ├── transcription.schema.ts # Transcription result schema (title + summary + categories + transcript)
│   └── index.ts                # Re-exports all schemas + types
├── prompts/
│   ├── chat.prompt.ts          # Chat system prompt builder (REWRITTEN)
│   ├── transcription.prompt.ts # Transcription prompt (REWRITTEN — becomes the active one)
│   ├── document.prompt.ts      # Document processing prompt (EXISTS — wire up, remove delimiters)
│   └── index.ts                # Re-exports all prompt builders
├── streaming/
│   └── jsonStreamExtractor.ts  # JSON stream text extractor (used in Phase 3)
├── requestBuilder.ts           # buildChatRequest(), buildTranscriptionRequest() — the core coupling layer
├── types.ts                    # ChatRequestConfig, OutputSchema, and shared AI types
└── index.ts                    # Barrel export
```

## 1. Shared Types (`src/core/ai/types.ts`)

These are the types that flow through the entire system. Defined once, imported everywhere.

```typescript
// src/core/ai/types.ts

/**
 * Provider-agnostic output schema descriptor.
 * Each adapter maps this to its native structured output parameter.
 *
 * `name` is optional — only OpenAI requires it. Adapters that need a name
 * and don't receive one should derive it (e.g., from the schema's top-level
 * property names or use a sensible default like 'response').
 */
export interface OutputSchema {
  name?: string;
  schema: Record<string, unknown>;
}

/**
 * The single configuration object for an LLM chat request.
 * Built once by buildChatRequest(), threaded through the entire chain.
 *
 * This is the ONE source of truth for what prompt to use and what schema
 * to pass. No other code should make these decisions independently.
 *
 * The prompt ALWAYS describes JSON fields. The schema provides API-level
 * enforcement when the model supports it. If outputSchema is undefined,
 * the prompt still asks for JSON — response parsing handles non-compliance.
 */
export interface ChatRequestConfig {
  /** The system prompt — always describes JSON output fields */
  systemPrompt: string;
  /** The output schema to pass to the adapter. undefined = no API-level enforcement */
  outputSchema: OutputSchema | undefined;
  /** Whether a title field is included in the schema (first message only) */
  includesTitle: boolean;
}

/**
 * Same pattern for transcription requests.
 * Prompt always describes JSON fields. Schema provides API-level enforcement.
 */
export interface TranscriptionRequestConfig {
  prompt: string;
  outputSchema: OutputSchema | undefined;
}
```

## 2. Chat Response Schemas

```typescript
// src/core/ai/schemas/chat.schema.ts

/**
 * JSON Schema for chat responses.
 *
 * The `response` field contains the full markdown response.
 * `suggestions` contains exactly 3 follow-up prompts in the user's voice.
 */
export const CHAT_RESPONSE_SCHEMA = {
  type: 'object' as const,
  properties: {
    response: {
      type: 'string',
      description: 'The full assistant response in markdown format.',
    },
    suggestions: {
      type: 'array',
      items: { type: 'string' },
      minItems: 3,
      maxItems: 3,
      description: 'Exactly 3 follow-up suggestions written as the user would type them.',
    },
  },
  required: ['response', 'suggestions'],
  additionalProperties: false,
} as const;

/**
 * Extended schema for the first message of a new session.
 * Includes a `title` field so we don't need a separate LLM call.
 */
export const CHAT_RESPONSE_WITH_TITLE_SCHEMA = {
  type: 'object' as const,
  properties: {
    response: {
      type: 'string',
      description: 'The full assistant response in markdown format.',
    },
    suggestions: {
      type: 'array',
      items: { type: 'string' },
      minItems: 3,
      maxItems: 3,
      description: 'Exactly 3 follow-up suggestions written as the user would type them.',
    },
    title: {
      type: 'string',
      description: 'A concise 3-6 word title summarizing the conversation topic.',
    },
  },
  required: ['response', 'suggestions', 'title'],
  additionalProperties: false,
} as const;

/** TypeScript types matching the schemas */
export interface ChatResponse {
  response: string;
  suggestions: string[];
}

export interface ChatResponseWithTitle extends ChatResponse {
  title: string;
}
```

### Why Two Schemas?

- **CHAT_RESPONSE_SCHEMA**: Used for all exchanges after the first. No `title` field — model doesn't waste tokens.
- **CHAT_RESPONSE_WITH_TITLE_SCHEMA**: First exchange only. Eliminates the separate `generateTitle()` call.

Schema selection is NOT done by the caller. It's done by `buildChatRequest()` (see section 4).

## 3. Transcription Schema

```typescript
// src/core/ai/schemas/transcription.schema.ts

export const TRANSCRIPTION_SCHEMA = {
  type: 'object' as const,
  properties: {
    title: {
      type: 'string',
      description: 'Concise descriptive title, max 6 words.',
    },
    summary: {
      type: 'string',
      description: 'Structured markdown summary with headers: Meeting Overview, Key Discussion Points, Decisions Made, Action Items, Next Steps.',
    },
    categories: {
      type: 'array',
      items: { type: 'string' },
      description: 'One or more categories from the provided list.',
    },
    transcript: {
      type: 'string',
      description: 'Complete verbatim transcription with timestamps in [MM:SS] Speaker: format.',
    },
  },
  required: ['title', 'summary', 'categories', 'transcript'],
  additionalProperties: false,
} as const;

export interface TranscriptionResponse {
  title: string;
  summary: string;
  categories: string[];
  transcript: string;
}
```

## 4. Request Builders — The Core Coupling Layer

This is the critical piece. Prompt and schema are ALWAYS built together. No caller can get a prompt without the matching schema decision, or vice versa.

```typescript
// src/core/ai/requestBuilder.ts

import { CHAT_RESPONSE_SCHEMA, CHAT_RESPONSE_WITH_TITLE_SCHEMA } from './schemas/chat.schema';
import { TRANSCRIPTION_SCHEMA } from './schemas/transcription.schema';
import { buildChatSystemPrompt } from './prompts/chat.prompt';
import { buildTranscriptionPrompt } from './prompts/transcription.prompt';
import type { ChatRequestConfig, TranscriptionRequestConfig, OutputSchema } from './types';

export interface ChatRequestOptions {
  contextBlock?: string;
  hasTools?: boolean;
  meetingCount?: number;
  isFirstMessage?: boolean;
  supportsStructuredOutput?: boolean;  // from model capabilities
}

/**
 * Build the complete chat request configuration.
 * Returns prompt + schema + flags as an atomic unit.
 *
 * This is the ONLY place that decides:
 * - Whether API-level schema enforcement is used (based on model capability)
 * - Which schema variant to use (title vs no-title, based on isFirstMessage)
 *
 * The prompt always describes JSON fields — there is no "delimiter variant".
 * Both unifiedAIService and the tool orchestrator call this.
 * Neither makes schema/prompt decisions on its own.
 */
export function buildChatRequest(options: ChatRequestOptions): ChatRequestConfig {
  const {
    contextBlock,
    hasTools = false,
    meetingCount = 0,
    isFirstMessage = false,
    supportsStructuredOutput = false,
  } = options;

  const includesTitle = supportsStructuredOutput && isFirstMessage;

  const outputSchema: OutputSchema | undefined = supportsStructuredOutput
    ? {
        name: includesTitle ? 'chat_response_with_title' : 'chat_response',
        schema: includesTitle ? CHAT_RESPONSE_WITH_TITLE_SCHEMA : CHAT_RESPONSE_SCHEMA,
      }
    : undefined;

  // Prompt always describes JSON fields — no mode switching.
  // isFirstMessage controls whether the title instruction is included.
  const systemPrompt = buildChatSystemPrompt({
    contextBlock,
    hasTools,
    meetingCount,
    isFirstMessage: includesTitle,
  });

  return {
    systemPrompt,
    outputSchema,
    includesTitle,
  };
}

export interface TranscriptionRequestOptions {
  categories: string[];
  supportsStructuredOutput?: boolean;
}

/**
 * Same pattern for transcription — prompt + schema as atomic pair.
 */
export function buildTranscriptionRequest(options: TranscriptionRequestOptions): TranscriptionRequestConfig {
  const { categories, supportsStructuredOutput = false } = options;

  const outputSchema: OutputSchema | undefined = supportsStructuredOutput
    ? { name: 'transcription', schema: TRANSCRIPTION_SCHEMA }
    : undefined;

  // Prompt always describes JSON fields — no mode switching.
  const prompt = buildTranscriptionPrompt({ categories });

  return { prompt, outputSchema };
}
```

### Why This Matters

Without this, you'd have:
- `unifiedAIService.ts` deciding schema → could pick title schema
- `tool-orchestrator/index.ts` deciding schema → could pick different schema
- `chat.prompt.ts` building prompt → could describe delimiters when schema expects JSON
- `ChatContext.tsx` parsing response → could try JSON when response is delimiter-formatted

With `buildChatRequest()`, there's ONE function that makes ALL these decisions. Everyone else just receives the `ChatRequestConfig` and follows it.

## 5. Prompt Consolidation

### Chat Prompt (`src/core/ai/prompts/chat.prompt.ts` — ALREADY REWRITTEN)

This file has been implemented. The prompt always describes JSON output fields. There is no `useStructuredOutput` flag, no branching, no delimiter instructions.

```typescript
export interface ChatPromptOptions {
  contextBlock?: string;
  hasTools?: boolean;
  meetingCount?: number;
  isFirstMessage?: boolean;
}

export function buildChatSystemPrompt(options: ChatPromptOptions = {}): string {
  // Base identity (Voxy)
  // Tool guidance (conditional on hasTools)
  // Context block (conditional on contextBlock)
  // Structured output instructions (ALWAYS present):
  //   - `response`: full markdown answer
  //   - `suggestions`: exactly 3 follow-ups in user's voice
  //   - `title`: concise 3-6 word title (only when isFirstMessage)
}
```

The prompt always says "Your response will be structured as JSON". Schema enforcement at the API level is a separate concern handled by adapters.

### Transcription Prompt (`src/core/ai/prompts/transcription.prompt.ts` — REWRITE)

Same principle as chat: prompt always describes JSON fields. No branching.

```typescript
export interface TranscriptionPromptOptions {
  categories: string[];
}

export function buildTranscriptionPrompt(options: TranscriptionPromptOptions): string {
  // Same content expectations as current (Meeting Overview, Key Discussion Points, etc.)
  // Always describes JSON output: `title`, `summary`, `categories`, `transcript` fields.
  // No delimiter instructions. No mode switching.
}
```

### Files to Delete

- `src/core/ai/prompts/summary.prompt.ts` — unused

### Files to Keep

- `src/core/ai/prompts/document.prompt.ts` — already used, same treatment as transcription

## 6. Barrel Exports

```typescript
// src/core/ai/index.ts
export * from './types';
export * from './schemas';
export * from './prompts';
export { buildChatRequest, buildTranscriptionRequest } from './requestBuilder';
```

## Dependencies

- **No new dependencies.** JSON schemas are plain objects. No Zod needed.
- The existing `JSONSchema` type in `extensions/tools/types.ts` (tool parameters) is separate from these output schemas. They don't conflict.

## Migration Notes

- Phase 1 is **additive only** — create new files, don't delete or modify existing ones yet.
- The new prompts, schemas, and request builders are importable but not wired up until Phase 2-4.
- This allows testing request builders in isolation: call `buildChatRequest({ supportsStructuredOutput: true, isFirstMessage: true })` and verify the returned config has the right prompt + schema pair.
