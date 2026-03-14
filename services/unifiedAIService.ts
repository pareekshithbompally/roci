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
   * Parse transcription result: try structured JSON first, fall back to delimiter parsing.
   */
  private parseTranscriptionResult(text: string, isStructured: boolean): ProcessedResult {
    if (isStructured) {
      try {
        const parsed: TranscriptionResponse = JSON.parse(text);
        return {
          title: parsed.title,
          summary: parsed.summary,
          categories: parsed.categories,
          transcript: parsed.transcript,
          structuredSummary: this.parseStructuredSummary(parsed.summary),
        };
      } catch {
        // Fall through to delimiter parsing
      }
    }

    return this.parseTranscriptionResponseLegacy(text);
  }

  /** Legacy delimiter-based transcription parser — fallback for models without structured output */
  private parseTranscriptionResponseLegacy(text: string): ProcessedResult {
    const titleMatch = text.match(/---TITLE---([\s\S]*?)(?=---SUMMARY---|$)/);
    const summaryMatch = text.match(/---SUMMARY---([\s\S]*?)(?=---CATEGORIES---|$)/);
    const categoryMatch = text.match(/---CATEGORIES---([\s\S]*?)(?=---TRANSCRIPT---|$)/);
    const transcriptMatch = text.match(/---TRANSCRIPT---([\s\S]*?$)/);

    if (!titleMatch && !summaryMatch && !transcriptMatch) {
      const lines = text.split('\n').filter(line => line.trim());
      return {
        title: lines[0]?.substring(0, 60) || 'Untitled Document',
        summary: text.trim(),
        categories: [],
        transcript: text.trim(),
        structuredSummary: {
          tldr: 'Unable to parse structured summary',
          notes: text.trim(),
          actionItems: [],
        },
      };
    }

    const rawCategories = categoryMatch ? categoryMatch[1] : '';
    const categories = rawCategories
      .replace(/[\[\]]/g, '')
      .split(',')
      .map(c => c.trim())
      .filter(c => c);

    const rawSummary = summaryMatch ? summaryMatch[1].trim() : 'No summary.';

    return {
      title: titleMatch ? titleMatch[1].trim() : 'Untitled',
      summary: rawSummary,
      categories,
      transcript: transcriptMatch ? transcriptMatch[1].trim() : text,
      structuredSummary: this.parseStructuredSummary(rawSummary),
    };
  }

  private parseStructuredSummary(summaryText: string) {
    const overviewMatch = summaryText.match(/##?\s*Meeting Overview\s*([\s\S]*?)(?=##?\s*Key Discussion|##?\s*Decisions|$)/i);
    const actionItemsMatch = summaryText.match(/##?\s*Action Items?\s*([\s\S]*?)(?=##?\s*Next Steps|$)/i);

    const actionItems: any[] = [];
    const itemsText = actionItemsMatch ? actionItemsMatch[1] : '';
    const lines = itemsText.split('\n').filter(line => line.trim());

    lines.forEach((line, idx) => {
      const trimmed = line.replace(/^[-•*]\s*/, '').trim();
      if (trimmed && !trimmed.startsWith('#')) {
        actionItems.push({
          id: `action-${idx}-${Date.now()}`,
          text: trimmed,
          completed: false,
        });
      }
    });

    return {
      tldr: overviewMatch ? overviewMatch[1].trim() : undefined,
      notes: summaryText,
      actionItems: actionItems.length > 0 ? actionItems : undefined,
    };
  }
}

export const unifiedAIService = new UnifiedAIService();
