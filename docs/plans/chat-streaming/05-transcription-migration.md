# Phase 5 — Transcription & Document Processing Migration

## Objective

Migrate the transcription and document processing flows from delimiter-based parsing to structured output. These are **non-streaming** calls — the simplest migration. Uses `buildTranscriptionRequest()` from Phase 1 to couple prompt + schema, same pattern as chat.

## Current Flow

### Audio Transcription (`unifiedAIService.processAudio()`)

```
1. Resolve model (transcription model, not chat model)
2. Build prompt: TRANSCRIPTION_PROMPT(categories) — inline in unifiedAIService.ts
3. Route:
   a. Gemini: native audio → one API call with audio + prompt → text
   b. Others: Whisper transcribes → processDocument(transcript.txt, prompt) → text
4. Parse: parseTranscriptionResponse(text) — regex delimiter extraction
5. Return: ProcessedResult
```

### Document Processing (`unifiedAIService.processDocument()`)

```
1. Resolve model (transcription model)
2. Build prompt: TRANSCRIPTION_PROMPT(categories)
3. Call: adapter.processDocument({ file, resolved, prompt })
4. Parse: parseTranscriptionResponse(text) — same regex
5. Return: ProcessedResult
```

### The Parsing Problem

```typescript
private parseTranscriptionResponse(text: string): ProcessedResult {
  const titleMatch = text.match(/---TITLE---([\s\S]*?)(?=---SUMMARY---|$)/);
  const summaryMatch = text.match(/---SUMMARY---([\s\S]*?)(?=---CATEGORIES---|$)/);
  const categoryMatch = text.match(/---CATEGORIES---([\s\S]*?)(?=---TRANSCRIPT---|$)/);
  const transcriptMatch = text.match(/---TRANSCRIPT---([\s\S]*?$)/);
}
```

Fragile. Breaks when model deviates from exact format.

## New Flow — Using `buildTranscriptionRequest()`

### processAudio

```typescript
async processAudio(audioBlob, categories, settings, providers): Promise<ProcessedResult> {
  const resolved = resolveModel(settings.transcriptionModel, providers);
  // ...validation...

  const modelCaps = getModelCapabilities(resolved.provider, resolved.modelId);
  const config = buildTranscriptionRequest({
    categories,
    supportsStructuredOutput: modelCaps?.structuredOutput !== false,
  });

  const adapter = getAdapter(getProviderType(resolved.provider));

  if (adapter.type !== 'gemini') {
    // Whisper transcribes, then chat analyzes
    const transcript = await adapter.processAudio({ audioBlob, resolved, prompt: config.prompt });
    const transcriptFile = new File([`Transcript:\n${transcript}`], 'transcript.txt', { type: 'text/plain' });
    const analysisText = await adapter.processDocument({
      file: transcriptFile,
      resolved,
      prompt: config.prompt,
      outputSchema: config.outputSchema,  // from config
    });
    return this.parseTranscriptionResult(analysisText, !!config.outputSchema);
  }

  // Gemini: native audio processing
  const text = await adapter.processAudio({
    audioBlob,
    resolved,
    prompt: config.prompt,
    outputSchema: config.outputSchema,  // from config
  });
  return this.parseTranscriptionResult(text, !!config.outputSchema);
}
```

Same pattern as chat: build config once via `buildTranscriptionRequest()`, thread it through.

### processDocument

```typescript
async processDocument(file, categories, settings, providers): Promise<ProcessedResult> {
  const resolved = resolveModel(settings.transcriptionModel, providers);
  // ...validation...

  const modelCaps = getModelCapabilities(resolved.provider, resolved.modelId);
  const config = buildTranscriptionRequest({
    categories,
    supportsStructuredOutput: modelCaps?.structuredOutput !== false,
  });

  const adapter = getAdapter(getProviderType(resolved.provider));
  const text = await adapter.processDocument({
    file,
    resolved,
    prompt: config.prompt,
    outputSchema: config.outputSchema,
  });
  return this.parseTranscriptionResult(text, !!config.outputSchema);
}
```

### New Parser

```typescript
private parseTranscriptionResult(text: string, isStructured: boolean): ProcessedResult {
  if (isStructured) {
    try {
      const parsed: TranscriptionResponse = JSON.parse(text);
      return {
        title: parsed.title,
        summary: parsed.summary,
        categories: parsed.categories,  // Already an array!
        transcript: parsed.transcript,
        structuredSummary: this.parseStructuredSummary(parsed.summary),
      };
    } catch {
      // Fall through to delimiter parsing
    }
  }

  return this.parseTranscriptionResponseLegacy(text);
}
```

Clean: try structured first, fall back to delimiter if it fails.

## Adapter Changes for processAudio / processDocument

### TranscriptionOptions — Add outputSchema

```typescript
interface TranscriptionOptions {
  audioBlob: Blob;
  resolved: ResolvedModel;
  prompt: string;
  outputSchema?: OutputSchema;  // NEW
}
```

### Gemini — processAudio

```typescript
const response = await client.models.generateContent({
  model: resolved.modelId,
  contents: [{ role: 'user', parts: [audioPart, { text: prompt }] }],
  ...(outputSchema && {
    config: {
      responseMimeType: 'application/json',
      responseJsonSchema: outputSchema.schema,
    },
  }),
});
```

### OpenAI — processDocument (Chat Completions)

```typescript
const response = await client.chat.completions.create({
  model: resolved.modelId,
  messages: [{ role: 'system', content: prompt }, { role: 'user', content: fileContent }],
  ...(outputSchema && {
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: outputSchema.name || 'transcription',
        schema: outputSchema.schema,
        strict: true,
      },
    },
  }),
});
```

### Anthropic — processDocument

```typescript
const response = await client.messages.create({
  model: resolved.modelId,
  system: prompt,
  messages: [{ role: 'user', content: fileContent }],
  max_tokens: maxTokens,
  ...(outputSchema && {
    output_config: {
      format: {
        type: 'json_schema',
        schema: outputSchema.schema,
      },
    },
  }),
});
```

### Whisper — No Change

Whisper produces plain text transcripts. Structured output doesn't apply to Whisper — it's not a chat model. The schema applies to the analysis step that processes the Whisper transcript.

## What Gets Simpler

| Before | After |
|--------|-------|
| 4 regex patterns to extract sections | `JSON.parse()` + field access |
| Category string: `"Cat1, Cat2"` → split + trim + filter | Already an array: `["Cat1", "Cat2"]` |
| Fallback for malformed delimiters | JSON parse → catch → delimiter fallback |
| ~80 lines of parsing code | ~15 lines |

## What Stays the Same

- `parseStructuredSummary()` — extracts action items from markdown. This parses **content** (markdown → action items), not **format** (LLM output structure). Still needed.
- `ProcessedResult` type — unchanged. Same fields, same consumers.
- `RecordingContext.tsx` and `useTranscribeRecording.ts` — call `processAudio()`, receive `ProcessedResult`. No changes.
- `App.tsx` — calls `processDocument()`, receives `ProcessedResult`. No changes.

## Call Points — Zero UI Changes

| Call Point | File | Change |
|-----------|------|--------|
| `processRecordingSession()` | `RecordingContext.tsx:407` | None |
| `transcribe()` | `useTranscribeRecording.ts:51` | None |
| `handleFileUpload()` | `App.tsx:186` | None |

All three call the unified service and receive `ProcessedResult`. The structured output change is entirely within the service layer.

## Summary

| File | Change |
|------|--------|
| `services/unifiedAIService.ts` | `processAudio()` and `processDocument()` use `buildTranscriptionRequest()`, new `parseTranscriptionResult()` method |
| `services/adapters/types.ts` | Add `outputSchema?` to `TranscriptionOptions` |
| `services/adapters/gemini.adapter.ts` | Pass schema in `processAudio()` |
| `services/adapters/openai.adapter.ts` | Pass schema in `processDocument()` |
| `services/adapters/anthropic.adapter.ts` | Pass schema in `processDocument()` |
| UI components | **NO CHANGES** |
