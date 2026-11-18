/** Thin AI orchestrator: transcribeAudio (STT) → analyzeTranscript (LLM); no provider-specific logic. */

import { generateText } from 'ai';
import { integrationSettingsPath, isIntegrationEnabled } from '@shared/utils/integrations';
import { getProviderTitle } from '@shared/utils/provider.utils';
import { TRANSCRIPTION_CONFIG } from '@config/transcription.config';
import { CHAT_TITLE_MAX_CHARS, REPLY_PREVIEW_CHARS } from '@config/chat.config';
import type { ModelProvider } from '@shared/types/modelProviders';
import type { ProcessedResult, AppSettings, MeetingSummary, StoredTranscriptSegment } from '@shared/types';
import { resolveChatModel, resolveSummaryModel, requiresApiKey, type ResolvedModel } from '@shared/utils/modelResolver';
import { MAX_AUDIO_SIZE_BYTES, MAX_AUDIO_SIZE_MB, MIN_AUDIO_SIZE_BYTES, WAV_HEADER_SIZE_BYTES } from '@shared/utils/audio.utils';
import { CHAT_TITLE_PROMPT } from '@core/ai';
import { createModel } from './ai';
import { extractTokenUsage } from './ai/types';
import type { TokenUsage } from './ai/types';
import { recordUsage } from '@extensions/usage';
import { modalitiesService } from '@services/modalities';
import type { MeetingContext, UserNote } from '@core/ai/prompts/transcription.prompt';
import { store } from '@services/db';
import type { AnalysisResult } from '@core/ai/schemas/transcription.schema';
import {
  runTranscription,
  speechSelectionOf,
  analyzeTranscript,
  type TranscribeOptions,
  type TranscriptResult,
} from './ai/transcription';

/** Which meeting a summary belongs to, and its calendar context. */
export interface SummaryOptions {
  meetingContext?: MeetingContext;
  /** The meeting id; usage rows are attributed to it. */
  meetingId?: string;
  /** Cancels the summary request. */
  signal?: AbortSignal;
}

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

export async function transcribeAudio(
  audioBlob: Blob,
  settings: AppSettings,
  providers: ModelProvider[],
  options: TranscribeOptions = {},
  meetingId?: string,
): Promise<TranscriptResult> {
  const selection = speechSelectionOf(settings);
  if (!selection) {
    throw new Error('Choose a transcription model in Settings › Default Models.');
  }
  const integration = TRANSCRIPTION_CONFIG.integrationByProvider[selection.provider];
  if (integration && !isIntegrationEnabled(settings, integration)) {
    const name = getProviderTitle(selection.provider);
    throw new Error(`${name} is off in ${integrationSettingsPath(integration)}. Turn it on, or choose another transcription model.`);
  }
  assertAudioSize(audioBlob);
  // An audio model chosen via models.dev resolves its adapter from the catalog.
  await modalitiesService.ensureLoaded();
  const result = await runTranscription(audioBlob, selection, providers, options);
  if (result.usage) {
    recordUsage('transcription', { provider: selection.provider, modelId: selection.model }, result.usage, meetingId);
  }
  // No speech is an error so the analyzer can't invent a meeting from silence; dictation treats it as empty.
  if (!result.text.trim()) {
    throw new Error('No speech detected in this recording — transcription skipped.');
  }
  return result;
}

/** The Summary model, ready to call — or why it can't run. */
function summaryModelOrThrow(settings: AppSettings, providers: ModelProvider[]): ResolvedModel {
  const resolved = resolveSummaryModel(settings, providers);
  if (!resolved) {
    const id = settings.analyzeModel || settings.chatModel;
    throw new Error(`Summary model "${id}" isn't available. Choose one in Settings › Default Models.`);
  }
  if (requiresApiKey(resolved) && !resolved.apiKey) {
    throw new Error(`API key not configured for ${resolved.provider}. Please add it in Settings → Providers.`);
  }
  return resolved;
}

/** The notes the user typed in a meeting, oldest first, for its summary. */
async function meetingNotesOldestFirst(meetingId: string): Promise<UserNote[]> {
  const notes = await store.notes.list(meetingId);
  return notes
    .map(({ text, createdAt }) => ({ text, createdAt }))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

export async function audioToRawText(
  audioBlob: Blob,
  settings: AppSettings,
  providers: ModelProvider[],
): Promise<string> {
  return (await transcribeAudio(audioBlob, settings, providers)).text;
}

class UnifiedAIService {
  /** A finished transcript → title, summary, action items, categories (the Summary model). */
  async processTranscript(
    transcript: string,
    segments: StoredTranscriptSegment[] | undefined,
    categories: string[],
    settings: AppSettings,
    providers: ModelProvider[],
    options: SummaryOptions = {},
  ): Promise<ProcessedResult> {
    const resolved = summaryModelOrThrow(settings, providers);
    const userNotes = options.meetingId ? await meetingNotesOldestFirst(options.meetingId) : undefined;
    const analysis = await analyzeTranscript({ transcript, categories, resolved, userNotes, ...options });
    return this.toProcessedResult(analysis, transcript, segments);
  }

  async generateTitle(
    userMessage: string,
    assistantResponse: string,
    settings: AppSettings,
    providers: ModelProvider[],
  ): Promise<{ title: string; usage?: TokenUsage }> {
    const fallback = userMessage.slice(0, CHAT_TITLE_MAX_CHARS);
    const resolved = resolveChatModel(settings, providers);
    if (!resolved || (requiresApiKey(resolved) && !resolved.apiKey)) return { title: fallback };

    try {
      const model = createModel(resolved);
      const result = await generateText({
        model,
        instructions: CHAT_TITLE_PROMPT,
        messages: [{
          role: 'user',
          content: `User: ${userMessage}\nAssistant: ${assistantResponse.slice(0, REPLY_PREVIEW_CHARS)}`,
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
