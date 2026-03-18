/**
 * Unified AI Service — Thin Orchestrator
 *
 * Resolves models, builds prompts, delegates to the AI SDK,
 * and parses responses. No provider-specific logic lives here.
 */

import { streamText, generateText, Output, jsonSchema } from 'ai';
import type { FilePart, TextPart, UserContent } from 'ai';
import type { ModelProvider } from '@/types/modelProviders';
import type { ProcessedResult, ChatMessage, ChatPart, AppSettings } from '@/types';
import { resolveModel, getProviderType } from '@shared/utils/modelResolver';
import { MAX_AUDIO_SIZE_BYTES, MAX_AUDIO_SIZE_MB } from '@/utils/audioUtils';
import { parseVTT } from '@/utils/vttParser';
import { buildTranscriptionRequest } from '@core/ai';
import { modalitiesService } from './modalities';
import type { TranscriptionResponse } from '@core/ai/schemas/transcription.schema';
import { createModel, toSDKMessages, getWebSearchTools } from './ai';
import { getPlatformFetch } from './platform-fetch';
import type { ResolvedModel } from '@shared/utils/modelResolver';

// ============ Helpers ============

/**
 * Transcribe audio via the Whisper API using direct fetch (no OpenAI SDK).
 * Uses the provider's base URL for OpenAI-compatible providers, or the
 * standard OpenAI endpoint otherwise.
 */
async function whisperTranscribe(audioBlob: Blob, resolved: ResolvedModel): Promise<string> {
  const fetch = getPlatformFetch();
  const baseUrl = (resolved.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
  const endpoint = `${baseUrl}/audio/transcriptions`;

  let filename = 'audio.webm';
  if (audioBlob.type.includes('wav')) filename = 'audio.wav';
  else if (audioBlob.type.includes('mp3')) filename = 'audio.mp3';
  else if (audioBlob.type.includes('m4a')) filename = 'audio.m4a';

  const formData = new FormData();
  formData.append('file', audioBlob, filename);
  formData.append('model', 'whisper-1');
  formData.append('response_format', 'verbose_json');

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${resolved.apiKey}` },
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Whisper transcription failed (${response.status}): ${response.statusText}`);
  }

  const data = await response.json() as { text?: string; segments?: Array<{ start: number; text: string }> };

  if (data.segments && Array.isArray(data.segments)) {
    return data.segments
      .map((seg) => {
        const mins = Math.floor(seg.start / 60);
        const secs = Math.floor(seg.start % 60);
        const ts = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        return `[${ts}] ${seg.text}`;
      })
      .join('\n');
  }

  return data.text || 'No transcription available.';
}

/**
 * Convert a File to SDK-compatible user content parts.
 * VTT and text files are read as text; binary files use a file part.
 */
async function fileToSDKContent(file: File): Promise<UserContent> {
  if (file.name.endsWith('.vtt') || file.type === 'text/vtt') {
    const { fullText } = parseVTT(await file.text());
    return `Transcript:\n${fullText}`;
  }

  if (file.type === 'text/plain' || file.type === 'text/markdown' || file.name.endsWith('.md')) {
    return await file.text();
  }

  // Binary files — send as a file part (Gemini-compatible)
  const buffer = new Uint8Array(await file.arrayBuffer());
  const filePart: FilePart = { type: 'file', data: buffer, mediaType: file.type || 'application/octet-stream' };
  return [filePart];
}

// ============ Service ============

class UnifiedAIService {

  async processAudio(
    audioBlob: Blob,
    categories: string[],
    settings: AppSettings,
    providers: ModelProvider[]
  ): Promise<ProcessedResult> {
    const resolved = resolveModel(settings.transcriptionModel, providers);
    if (!resolved) {
      throw new Error(`Model "${settings.transcriptionModel}" not found. Please configure a model in Settings → Providers.`);
    }
    if (!resolved.apiKey) {
      throw new Error(`API key not configured for ${resolved.provider}. Please add it in Settings → Providers.`);
    }
    if (audioBlob.size > MAX_AUDIO_SIZE_BYTES) {
      throw new Error(`Recording is too large (${(audioBlob.size / (1024 * 1024)).toFixed(2)}MB). Limit is ${MAX_AUDIO_SIZE_MB}MB.`);
    }

    const modelInfo = modalitiesService.getModelInfo(resolved.provider, resolved.modelId);
    const config = buildTranscriptionRequest({
      categories,
      supportsStructuredOutput: modelInfo?.capabilities?.structuredOutput !== false,
    });

    const model = createModel(resolved);
    const audioData = new Uint8Array(await audioBlob.arrayBuffer());

    if (getProviderType(resolved.provider) === 'gemini') {
      // Gemini: native audio processing (audio + prompt in one call)
      if (config.outputSchema) {
        const result = await generateText({
          model,
          system: config.prompt,
          messages: [{
            role: 'user',
            content: [
              { type: 'file', data: audioData, mediaType: audioBlob.type || 'audio/webm' } satisfies FilePart,
              { type: 'text', text: 'Process this audio recording.' } satisfies TextPart,
            ],
          }],
          output: Output.object({ schema: jsonSchema(config.outputSchema.schema) }),
        });
        return this.parseTranscriptionResult(result.output as TranscriptionResponse, true);
      } else {
        const result = await generateText({
          model,
          system: config.prompt,
          messages: [{
            role: 'user',
            content: [
              { type: 'file', data: audioData, mediaType: audioBlob.type || 'audio/webm' } satisfies FilePart,
              { type: 'text', text: 'Process this audio recording.' } satisfies TextPart,
            ],
          }],
        });
        return this.parseTranscriptionResult(result.text, false);
      }
    }

    // Non-Gemini: Whisper transcribes, then model analyzes the transcript
    const transcript = await whisperTranscribe(audioBlob, resolved);

    if (config.outputSchema) {
      const result = await generateText({
        model,
        system: config.prompt,
        messages: [{ role: 'user', content: `Transcript:\n${transcript}` }],
        output: Output.object({ schema: jsonSchema(config.outputSchema.schema) }),
      });
      return this.parseTranscriptionResult(result.output as TranscriptionResponse, true);
    } else {
      const result = await generateText({
        model,
        system: config.prompt,
        messages: [{ role: 'user', content: `Transcript:\n${transcript}` }],
      });
      return this.parseTranscriptionResult(result.text, false);
    }
  }

  async processDocument(
    file: File,
    categories: string[],
    settings: AppSettings,
    providers: ModelProvider[]
  ): Promise<ProcessedResult> {
    const resolved = resolveModel(settings.transcriptionModel, providers);
    if (!resolved) {
      throw new Error(`Model "${settings.transcriptionModel}" not found. Please configure a model in Settings → Providers.`);
    }
    if (!resolved.apiKey) {
      throw new Error(`API key not configured for ${resolved.provider}. Please add it in Settings → Providers.`);
    }

    const modelInfo = modalitiesService.getModelInfo(resolved.provider, resolved.modelId);
    const config = buildTranscriptionRequest({
      categories,
      supportsStructuredOutput: modelInfo?.capabilities?.structuredOutput !== false,
    });

    const model = createModel(resolved);
    const content = await fileToSDKContent(file);

    if (config.outputSchema) {
      const result = await generateText({
        model,
        system: config.prompt,
        messages: [{ role: 'user', content }],
        output: Output.object({ schema: jsonSchema(config.outputSchema.schema) }),
      });
      return this.parseTranscriptionResult(result.output as TranscriptionResponse, true);
    } else {
      const result = await generateText({
        model,
        system: config.prompt,
        messages: [{ role: 'user', content }],
      });
      return this.parseTranscriptionResult(result.text, false);
    }
  }

  async chatStream(options: {
    messages: ChatMessage[];
    resolved: import('@shared/utils/modelResolver').ResolvedModel;
    systemPrompt: string;
    outputSchema?: import('@core/ai/types').OutputSchema;
    webSearchEnabled?: boolean;
    signal?: AbortSignal;
    onChunk: (text: string, metadata?: import('./ai/types').StreamMetadata) => void;
    onMediaPart?: (part: ChatPart) => void;
  }): Promise<import('./ai/types').TokenUsage | undefined> {
    const { messages, resolved, systemPrompt, outputSchema, webSearchEnabled, signal, onChunk } = options;

    const model = createModel(resolved);
    const webSearchTools = webSearchEnabled ? getWebSearchTools(resolved) : undefined;

    const result = streamText({
      model,
      system: systemPrompt,
      messages: toSDKMessages(messages),
      abortSignal: signal,
      ...(webSearchTools && { tools: webSearchTools }),
      ...(outputSchema && { output: Output.object({ schema: jsonSchema(outputSchema.schema) }) }),
    });

    const collectedSources: Array<{ url: string; title: string }> = [];

    let hasText = false;

    for await (const part of result.fullStream) {
      if (signal?.aborted) break;

      switch (part.type) {
        case 'text-delta':
          hasText = true;
          onChunk(part.text);
          break;
        case 'reasoning-delta':
          onChunk('', { isThinking: true, thinkingContent: part.text });
          break;
        case 'tool-input-start':
          if (part.toolName === 'webSearch' || part.toolName === 'googleSearch') {
            onChunk('', { isSearching: true });
          }
          break;
        case 'source':
          if (part.sourceType === 'url') {
            collectedSources.push({ url: part.url, title: part.title || '' });
          }
          break;
        case 'error':
          console.error('[UnifiedAI] Chat stream error:', part.error);
          throw part.error instanceof Error
            ? part.error
            : new Error(String(part.error ?? 'Model returned a stream error'));
      }
    }

    if (!hasText && !signal?.aborted) {
      const finishReason = await result.finishReason;
      console.warn('[UnifiedAI] Chat stream produced no text. finishReason:', finishReason);
      if (finishReason === 'content-filter') {
        throw new Error('Response blocked by content filter.');
      }
      if (finishReason === 'error') {
        throw new Error('Model returned an error.');
      }
    }

    if (collectedSources.length > 0) {
      onChunk('', { webCitations: collectedSources });
    }

    const usage = await result.usage;
    return {
      inputTokens: usage.inputTokens ?? undefined,
      outputTokens: usage.outputTokens ?? undefined,
    };
  }

  async generateTitle(
    userMessage: string,
    assistantResponse: string,
    settings: AppSettings,
    providers: ModelProvider[]
  ): Promise<string> {
    const fallback = userMessage.slice(0, 30);
    const resolved = resolveModel(settings.chatModel, providers);
    if (!resolved?.apiKey) return fallback;

    try {
      const model = createModel(resolved);
      const result = await generateText({
        model,
        system: 'You are a title generator. Your ONLY job is to output a short 3-6 word topic title summarizing what the conversation is about. Output NOTHING else — no explanation, no apology, no commentary. Just the title words. Never start with "I".',
        messages: [{
          role: 'user',
          content: `User: ${userMessage}\nAssistant: ${assistantResponse.slice(0, 500)}`,
        }],
      });

      let title = result.text
        .split('\n')[0]                      // first line only
        .trim()
        .replace(/^[#*\-–—•>]+\s*/g, '')    // strip leading markdown bullets / headers
        .replace(/\*\*(.*?)\*\*/g, '$1')     // strip bold **text**
        .replace(/__(.*?)__/g, '$1')         // strip __italic__
        .replace(/`(.*?)`/g, '$1')           // strip inline code
        .replace(/^["']|["']$/g, '')         // strip wrapping quotes
        .replace(/^[A-Za-z]+:\s+/g, '')      // strip "Title: " / "Name: " prefixes
        .replace(/[.!?…]+$/, '')             // strip trailing punctuation (incl. unicode ellipsis)
        .trim();

      // Truncate to 60 chars on a word boundary (no mid-word cutoffs)
      if (title.length > 60) {
        title = title.slice(0, 60).replace(/\s+\S*$/, '').trim();
      }

      // Reject garbage: too short, no letters, too many words (model rambled
      // instead of generating a concise title), or starts with refusal phrases
      const wordCount = title.split(/\s+/).length;
      const isRefusal = /^(I\s+(don't|cannot|can't|do not|am not)|sorry|unfortunately|as an? ai)/i.test(title);
      const isUsable =
        title.length >= 2 &&
        wordCount <= 10 &&
        !isRefusal &&
        /[a-zA-Z\u00C0-\u024F\u4e00-\u9fff]/.test(title);

      return isUsable ? title : fallback;
    } catch (error) {
      console.error('[UnifiedAIService] Title generation failed:', error);
      return fallback;
    }
  }

  // ============ Response Parsing ============

  /**
   * Parse transcription result from structured JSON.
   * The LLM returns a structured summary object — no regex parsing needed.
   */
  private parseTranscriptionResult(input: string | TranscriptionResponse, isStructured: boolean): ProcessedResult {
    if (isStructured) {
      try {
        const parsed: TranscriptionResponse = typeof input === 'string'
          ? JSON.parse(input)
          : input as TranscriptionResponse;
        const summary = parsed.summary;

        // Build a flat summary string for backward compat (copy/download)
        const summaryString = this.buildSummaryString(summary);

        // Map MeetingSummary → StructuredSummary
        return {
          title: parsed.title,
          summary: summaryString,
          categories: parsed.categories,
          transcript: parsed.transcript,
          structuredSummary: {
            overview: summary.overview,
            keyDiscussionPoints: summary.keyDiscussionPoints,
            decisionsMade: summary.decisionsMade,
            actionItems: summary.actionItems.map((item) => ({
              id: crypto.randomUUID(),
              text: item.text,
              owner: item.owner,
              dueDate: item.dueDate,
              completed: false,
            })),
            nextSteps: summary.nextSteps,
          },
        };
      } catch (error) {
        console.error('[UnifiedAIService] Failed to parse structured response:', error);
        // Fall through to plain text fallback
      }
    }

    // Fallback for non-structured responses — should not happen with current models
    const textFallback = typeof input === 'string' ? input : JSON.stringify(input);
    return {
      title: 'Untitled',
      summary: textFallback,
      categories: [],
      transcript: textFallback,
      structuredSummary: {
        overview: 'Unable to parse structured summary',
        keyDiscussionPoints: [],
        decisionsMade: [],
        actionItems: [],
        nextSteps: [],
      },
    };
  }

  /** Build a readable summary string from structured fields (for copy/download) */
  private buildSummaryString(summary: import('@/types').MeetingSummary): string {
    const parts: string[] = [];
    parts.push(`## Meeting Overview\n${summary.overview}`);
    if (summary.keyDiscussionPoints.length > 0) {
      parts.push(`## Key Discussion Points\n${summary.keyDiscussionPoints.map(p => `- ${p}`).join('\n')}`);
    }
    if (summary.decisionsMade.length > 0) {
      parts.push(`## Decisions Made\n${summary.decisionsMade.map(d => `- ${d}`).join('\n')}`);
    }
    if (summary.actionItems.length > 0) {
      parts.push(`## Action Items\n${summary.actionItems.map(a => {
        let line = `- ${a.text}`;
        if (a.owner) line += ` - Owner: ${a.owner}`;
        if (a.dueDate) line += ` - Due: ${a.dueDate}`;
        return line;
      }).join('\n')}`);
    }
    if (summary.nextSteps.length > 0) {
      parts.push(`## Next Steps\n${summary.nextSteps.map(s => `- ${s}`).join('\n')}`);
    }
    return parts.join('\n\n');
  }
}

export const unifiedAIService = new UnifiedAIService();
