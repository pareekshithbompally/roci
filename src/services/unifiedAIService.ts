/**
 * Unified AI Service — Thin Orchestrator
 *
 * Resolves models, builds prompts, delegates to the AI SDK,
 * and parses responses. No provider-specific logic lives here.
 *
 * Pipeline:  transcribeAudio (STT) → analyzeTranscript (LLM) = ProcessedResult
 */

import { generateText, Output, jsonSchema } from 'ai';
import type { FilePart, UserContent } from 'ai';
import type { ModelProvider } from '@shared/types/modelProviders';
import type { ProcessedResult, AppSettings, MeetingSummary, StoredTranscriptSegment } from '@shared/types';
import { resolveModel } from '@shared/utils/modelResolver';
import { MAX_AUDIO_SIZE_BYTES, MAX_AUDIO_SIZE_MB, MIN_AUDIO_SIZE_BYTES, WAV_HEADER_SIZE_BYTES } from '@shared/utils/audio.utils';
import { parseVTT } from '@shared/utils/vtt.utils';
import { buildTranscriptionRequest, formatTemporalContext } from '@core/ai';
import { createModel } from './ai';
import { extractTokenUsage } from './ai/types';
import type { TokenUsage } from './ai/types';
import type { MeetingContext } from '@core/ai/prompts/transcription.prompt';
import type { AnalysisResult } from '@core/ai/schemas/transcription.schema';
import {
  runTranscription,
  speechSelectionOf,
  formatTranscript,
  analyzeTranscript,
  type TranscribeOptions,
  type TranscriptResult,
} from './ai/transcription';

const assertAudioSize = (blob: Blob): void => {
  if (blob.size > MAX_AUDIO_SIZE_BYTES) {
    throw new Error(`Recording is too large (${(blob.size / (1024 * 1024)).toFixed(2)}MB). Limit is ${MAX_AUDIO_SIZE_MB}MB.`);
  }
  if (blob.size <= WAV_HEADER_SIZE_BYTES) {
    throw new Error('Recording contains no audio data — the file is empty. This usually means audio capture failed silently. Please check your audio permissions in System Settings → Privacy & Security → Screen & System Audio Recording and try again.');
  }
  if (blob.size < MIN_AUDIO_SIZE_BYTES) {
    throw new Error(`Recording is too short to process (${blob.size} bytes). Please ensure audio is being captured before stopping.`);
  }
};

async function fileToSDKContent(file: File): Promise<UserContent> {
  if (file.name.endsWith('.vtt') || file.type === 'text/vtt') {
    const { fullText } = parseVTT(await file.text());
    return `Transcript:\n${fullText}`;
  }

  if (file.type === 'text/plain' || file.type === 'text/markdown' || file.name.endsWith('.md')) {
    return await file.text();
  }

  const buffer = new Uint8Array(await file.arrayBuffer());
  const filePart: FilePart = { type: 'file', data: buffer, mediaType: file.type || 'application/octet-stream' };
  return [filePart];
}

export async function transcribeAudio(
  audioBlob: Blob,
  settings: AppSettings,
  providers: ModelProvider[],
  options: TranscribeOptions = {},
): Promise<TranscriptResult> {
  const selection = speechSelectionOf(settings);
  if (!selection) {
    throw new Error('Choose a transcription model in Settings › Audio.');
  }
  assertAudioSize(audioBlob);
  const result = await runTranscription(audioBlob, selection, providers, options);
  // VAD found no speech (or every part decoded to nothing): surfacing this as
  // an error beats the alternative — the analyzer inventing a meeting about
  // silence. Dictation callers swallow it into an empty insert.
  if (!result.text.trim()) {
    throw new Error('No speech detected in this recording — transcription skipped.');
  }
  return result;
}

async function analyzeStage(args: {
  transcript: string;
  categories: string[];
  settings: AppSettings;
  providers: ModelProvider[];
  meetingContext?: MeetingContext;
}): Promise<{ result: AnalysisResult; usage?: TokenUsage }> {
  const analyzeModelId = args.settings.analyzeModel || args.settings.chatModel;
  const resolved = resolveModel(analyzeModelId, args.providers);
  if (!resolved) {
    throw new Error(`Analyze model "${analyzeModelId}" not found. Please configure a model in Settings → Providers.`);
  }
  if (!resolved.apiKey) {
    throw new Error(`API key not configured for ${resolved.provider}. Please add it in Settings → Providers.`);
  }
  return analyzeTranscript({
    transcript: args.transcript,
    categories: args.categories,
    resolved,
    meetingContext: args.meetingContext,
  });
}

export async function audioToRawText(
  audioBlob: Blob,
  settings: AppSettings,
  providers: ModelProvider[],
): Promise<string> {
  return (await transcribeAudio(audioBlob, settings, providers)).text;
}

class UnifiedAIService {
  async processAudio(
    audioBlob: Blob,
    categories: string[],
    settings: AppSettings,
    providers: ModelProvider[],
    meetingContext?: MeetingContext,
    options: TranscribeOptions & { onSummarizing?: () => void } = {},
  ): Promise<{ result: ProcessedResult; usage?: TokenUsage }> {
    const t = await transcribeAudio(audioBlob, settings, providers, options);
    const { formatted: transcript, segments } = formatTranscript(t);
    options.onSummarizing?.();

    const { result: analysis, usage } = await analyzeStage({
      transcript,
      categories,
      settings,
      providers,
      meetingContext,
    });

    return {
      result: this.toProcessedResult(analysis, transcript, segments),
      usage,
    };
  }

  async processDocument(
    file: File,
    categories: string[],
    settings: AppSettings,
    providers: ModelProvider[],
  ): Promise<{ result: ProcessedResult; usage?: TokenUsage }> {
    const content = await fileToSDKContent(file);
    const text = typeof content === 'string' ? content : '[binary file content]';
    const analyzeModelId = settings.analyzeModel || settings.chatModel;
    const resolved = resolveModel(analyzeModelId, providers);
    if (!resolved) {
      throw new Error(`Analyze model "${analyzeModelId}" not found. Please configure a model in Settings → Providers.`);
    }
    if (!resolved.apiKey) {
      throw new Error(`API key not configured for ${resolved.provider}. Please add it in Settings → Providers.`);
    }
    const config = buildTranscriptionRequest({
      categories,
      supportsStructuredOutput: true,
      temporalContext: formatTemporalContext(),
    });
    if (!config.outputSchema) {
      throw new Error('Structured output schema unavailable for transcription analysis.');
    }
    const result = await generateText({
      model: createModel(resolved),
      instructions: config.prompt,
      messages: [{ role: 'user', content }],
      output: Output.object({ schema: jsonSchema(config.outputSchema.schema) }),
    });
    const analysis = result.output as AnalysisResult;
    return {
      result: this.toProcessedResult(analysis, text),
      usage: extractTokenUsage(result.usage),
    };
  }

  async generateTitle(
    userMessage: string,
    assistantResponse: string,
    settings: AppSettings,
    providers: ModelProvider[],
  ): Promise<{ title: string; usage?: TokenUsage }> {
    const fallback = userMessage.slice(0, 30);
    const resolved = resolveModel(settings.chatModel, providers);
    if (!resolved?.apiKey) return { title: fallback };

    try {
      const model = createModel(resolved);
      const temporalContext = formatTemporalContext();
      const result = await generateText({
        model,
        instructions: `You are a title generator. ${temporalContext} Your ONLY job is to output a short 3-6 word topic title summarizing what the conversation is about. Output NOTHING else — no explanation, no apology, no commentary. Just the title words. Never start with "I".`,
        messages: [{
          role: 'user',
          content: `User: ${userMessage}\nAssistant: ${assistantResponse.slice(0, 500)}`,
        }],
      });

      const usage = extractTokenUsage(result.usage);

      let title = result.text
        .split('\n')[0]
        .trim()
        .replace(/^[#*\-–—•>]+\s*/g, '')
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/__(.*?)__/g, '$1')
        .replace(/`(.*?)`/g, '$1')
        .replace(/^["']|["']$/g, '')
        .replace(/^[A-Za-z]+:\s+/g, '')
        .replace(/[.!?…]+$/, '')
        .trim();

      if (title.length > 60) {
        title = title.slice(0, 60).replace(/\s+\S*$/, '').trim();
      }

      const wordCount = title.split(/\s+/).length;
      const isRefusal = /^(I\s+(don't|cannot|can't|do not|am not)|sorry|unfortunately|as an? ai)/i.test(title);
      const isUsable =
        title.length >= 2 &&
        wordCount <= 10 &&
        !isRefusal &&
        /[a-zA-Z\u00C0-\u024F\u4e00-\u9fff]/.test(title);

      return { title: isUsable ? title : fallback, usage };
    } catch (error) {
      console.error('[UnifiedAIService] Title generation failed:', error);
      return { title: fallback };
    }
  }

  private toProcessedResult(analysis: AnalysisResult, transcript: string, segments?: StoredTranscriptSegment[]): ProcessedResult {
    const summary = analysis.summary;
    const summaryString = this.buildSummaryString(summary);

    return {
      title: analysis.title,
      summary: summaryString,
      categories: analysis.categories,
      transcript,
      segments: segments && segments.length > 0 ? segments : undefined,
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
  }

  private buildSummaryString(summary: MeetingSummary): string {
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
