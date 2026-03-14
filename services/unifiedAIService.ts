/**
 * Unified AI Service — Thin Orchestrator
 *
 * Resolves models, builds prompts, delegates to provider adapters,
 * and parses responses. No provider-specific logic lives here.
 */

import type { ModelProvider } from '@/types/modelProviders';
import type { ProcessedResult, ChatMessage, ChatPart, AppSettings } from '@/types';
import { resolveModel, getProviderType } from '@shared/utils/modelResolver';
import { MAX_AUDIO_SIZE_BYTES, MAX_AUDIO_SIZE_MB } from '@/utils/audioUtils';
import { getAdapter } from './adapters';
import { buildTranscriptionRequest } from '@core/ai';
import { modalitiesService } from './modalities';
import type { TranscriptionResponse } from '@core/ai/schemas/transcription.schema';

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

    const adapter = getAdapter(getProviderType(resolved.provider));

    if (adapter.type !== 'gemini') {
      // Non-Gemini: Whisper transcribes, then chat analyzes the transcript
      const transcript = await adapter.processAudio({ audioBlob, resolved, prompt: config.prompt });
      const transcriptFile = new File(
        [`Transcript:\n${transcript}`],
        'transcript.txt',
        { type: 'text/plain' }
      );
      const analysisText = await adapter.processDocument({
        file: transcriptFile,
        resolved,
        prompt: config.prompt,
        outputSchema: config.outputSchema,
      });
      return this.parseTranscriptionResult(analysisText, !!config.outputSchema);
    }

    // Gemini: native audio processing (audio + prompt in one call)
    const text = await adapter.processAudio({
      audioBlob,
      resolved,
      prompt: config.prompt,
      outputSchema: config.outputSchema,
    });
    return this.parseTranscriptionResult(text, !!config.outputSchema);
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

    const adapter = getAdapter(getProviderType(resolved.provider));
    const text = await adapter.processDocument({
      file,
      resolved,
      prompt: config.prompt,
      outputSchema: config.outputSchema,
    });
    return this.parseTranscriptionResult(text, !!config.outputSchema);
  }

  async chatStream(options: {
    messages: ChatMessage[];
    resolved: import('@shared/utils/modelResolver').ResolvedModel;
    systemPrompt: string;
    outputSchema?: import('@core/ai/types').OutputSchema;
    webSearchEnabled?: boolean;
    signal?: AbortSignal;
    onChunk: (text: string, metadata?: import('./adapters/types').StreamMetadata) => void;
    onMediaPart?: (part: ChatPart) => void;
  }): Promise<import('./adapters/types').TokenUsage | undefined> {
    const { messages, resolved, systemPrompt, outputSchema, webSearchEnabled, signal, onChunk, onMediaPart } = options;
    const adapter = getAdapter(getProviderType(resolved.provider));

    return adapter.chatStream(
      { messages, resolved, systemPrompt, outputSchema, webSearchEnabled, signal },
      { onChunk, onMediaPart }
    );
  }

  /**
   * Generate a concise title for a chat session based on the first exchange.
   * Non-blocking — falls back to truncated user message on any failure.
   */
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
      const adapter = getAdapter(getProviderType(resolved.provider));

      // Single user message with embedded context — works uniformly across all
      // adapters (avoids Gemini role-alternation issues when the last message
      // is from the model, and removes ambiguity of continuing a conversation
      // vs. generating a title).
      const result = await adapter.chat({
        messages: [
          {
            id: '1',
            role: 'user',
            text: `User: ${userMessage}\nAssistant: ${assistantResponse.slice(0, 500)}`,
            timestamp: Date.now(),
          },
        ],
        resolved,
        systemPrompt:
          'You are a title generator. Your ONLY job is to output a short 3-6 word topic title summarizing what the conversation is about. Output NOTHING else — no explanation, no apology, no commentary. Just the title words. Never start with "I".',
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
  private parseTranscriptionResult(text: string, isStructured: boolean): ProcessedResult {
    if (isStructured) {
      try {
        const parsed: TranscriptionResponse = JSON.parse(text);
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
    return {
      title: 'Untitled',
      summary: text,
      categories: [],
      transcript: text,
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
