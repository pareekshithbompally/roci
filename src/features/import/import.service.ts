/**
 * Import Service — Orchestrates file import pipeline.
 *
 * Connects: dialog -> file read -> parse -> AI process -> save -> tray updates.
 * Singleton. Non-React — receives dependencies via method args.
 */

import type { AppSettings, MeetingSummary } from '@shared/types';
import type { ModelProvider } from '@shared/types/modelProviders';
import { dialogService } from '@services/tauri/dialog.service';
import { fileSystemService } from '@services/tauri/fileSystem.service';
import { unifiedAIService } from '@services/unifiedAIService';
import { transcriptionService } from '@services/transcription.service';
import { activityStore } from '@shared/stores/activityStore';
import { logUsage } from '@extensions/usage';
import { resolveModel } from '@shared/utils/modelResolver';
import { IMPORT_CONFIG } from '@config/audio.config';
import { parseSubtitleFile } from './parsers/subtitle-parser';
import { JobQueue } from './job-queue';
import type { ImportJob, ImportSource, JobStatus } from './types';

const AUTO_REMOVE_DELAY = 3000;

interface ImportServiceOptions {
  concurrency: number;
  onMeetingSaved?: () => void;
}

class ImportService {
  private queue: JobQueue<void>;
  private jobs = new Map<string, ImportJob>();
  private onMeetingSaved?: () => void;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: ImportServiceOptions) {
    this.onMeetingSaved = options.onMeetingSaved;
    this.queue = new JobQueue<void>({
      concurrency: options.concurrency,
      onJobUpdate: this.handleJobUpdate,
      onComplete: () => {},
    });
  }

  async importTranscripts(
    settings: AppSettings,
    providers: ModelProvider[],
    categories: string[],
  ): Promise<void> {
    const paths = await dialogService.open({
      title: IMPORT_CONFIG.transcript.dialogTitle,
      multiple: true,
      filters: [{ name: 'Subtitles', extensions: [...IMPORT_CONFIG.transcript.extensions] }],
    });

    if (!paths) return;
    const filePaths = Array.isArray(paths) ? paths : [paths];

    for (const filePath of filePaths) {
      const fileName = filePath.split('/').pop() || filePath;
      const id = crypto.randomUUID();
      const meetingId = crypto.randomUUID();

      const job: ImportJob = { id, filePath, fileName, source: 'transcript', meetingId, status: 'queued' };
      this.jobs.set(id, job);

      activityStore.add({
        id,
        type: 'import',
        label: fileName,
        status: 'active',
        percent: null,
        step: null,
        detail: 'Queued',
        error: null,
        actions: [{ icon: 'x', label: 'Cancel', onClick: () => this.cancelJob(id) }],
      });

      this.queue.enqueue({
        id,
        label: fileName,
        execute: (signal) => this.processTranscript(job, signal, settings, providers, categories),
      });
    }
  }

  async importAudio(
    settings: AppSettings,
    providers: ModelProvider[],
    categories: string[],
  ): Promise<void> {
    const paths = await dialogService.open({
      title: IMPORT_CONFIG.audio.dialogTitle,
      multiple: true,
      filters: [{ name: 'Audio', extensions: [...IMPORT_CONFIG.audio.extensions] }],
    });

    if (!paths) return;
    const filePaths = Array.isArray(paths) ? paths : [paths];

    for (const filePath of filePaths) {
      const fileName = filePath.split('/').pop() || filePath;
      const id = crypto.randomUUID();
      const meetingId = crypto.randomUUID();

      const job: ImportJob = { id, filePath, fileName, source: 'audio', meetingId, status: 'queued' };
      this.jobs.set(id, job);

      activityStore.add({
        id,
        type: 'import',
        label: fileName,
        status: 'active',
        percent: null,
        step: null,
        detail: 'Queued',
        error: null,
        actions: [{ icon: 'x', label: 'Cancel', onClick: () => this.cancelJob(id) }],
      });

      this.queue.enqueue({
        id,
        label: fileName,
        execute: (signal) => this.processAudio(job, signal, settings, providers, categories),
      });
    }
  }

  updateConcurrency(settings: AppSettings): void {
    const jp = settings.jobProcessing;
    const concurrency = jp?.mode === 'parallel' ? jp.maxConcurrent : 1;
    this.queue.updateConcurrency(concurrency);
  }

  setOnMeetingSaved(cb: () => void): void {
    this.onMeetingSaved = cb;
  }

  cancelJob(jobId: string): void {
    this.queue.abort(jobId);
  }

  cancelAll(): void {
    this.queue.abortAll();
  }

  get isImporting(): boolean {
    return this.queue.pendingCount > 0;
  }

  // ── Private ────────────────────────────────────────────────────

  private async processTranscript(
    job: ImportJob,
    signal: AbortSignal,
    settings: AppSettings,
    providers: ModelProvider[],
    categories: string[],
  ): Promise<void> {
    activityStore.update(job.id, { detail: 'Reading file...' });

    const text = await fileSystemService.readTextFile(job.filePath);
    if (signal.aborted) throw new Error('Import cancelled');

    const format = job.filePath.endsWith('.vtt') ? 'vtt' : 'srt';
    const transcript = parseSubtitleFile(text, format);

    activityStore.update(job.id, { detail: 'Analyzing...' });

    const transcriptFile = new File(
      [`Transcript:\n${transcript}`],
      'transcript.txt',
      { type: 'text/plain' },
    );
    const { result, usage } = await unifiedAIService.processDocument(transcriptFile, categories, settings, providers);
    if (signal.aborted) throw new Error('Import cancelled');

    const resolved = resolveModel(settings.analyzeModel || settings.chatModel, providers);
    logUsage({ category: 'transcription', sessionId: job.meetingId, provider: resolved?.provider, model: resolved?.modelId, usage }).catch(e => console.error('[UsageLog] transcription:', e));

    const meetingSummary = this.buildMeetingSummary(result);

    await transcriptionService.saveTranscriptionResult({
      meetingId: job.meetingId,
      title: result.title,
      transcript,
      summary: meetingSummary,
      categories: result.categories,
      inputSource: 'transcript-import',
      extractionContext: { settings, providers },
    });

    this.debouncedRefresh();
  }

  private async processAudio(
    job: ImportJob,
    signal: AbortSignal,
    settings: AppSettings,
    providers: ModelProvider[],
    categories: string[],
  ): Promise<void> {
    activityStore.update(job.id, { detail: 'Reading file...' });

    const bytes = await fileSystemService.readFile(job.filePath);
    if (signal.aborted) throw new Error('Import cancelled');

    if (bytes.length > IMPORT_CONFIG.audio.maxSizeBytes) {
      throw new Error(
        `File too large (${(bytes.length / 1024 / 1024).toFixed(1)}MB). Max: ${IMPORT_CONFIG.audio.maxSizeMB}MB`,
      );
    }

    const ext = job.filePath.split('.').pop()!.toLowerCase();
    const mime = IMPORT_CONFIG.audio.mimeTypes[ext] || 'audio/wav';
    const blob = new Blob([bytes], { type: mime });

    activityStore.update(job.id, { detail: 'Transcribing...' });

    const { result, usage: audioUsage } = await unifiedAIService.processAudio(blob, categories, settings, providers, undefined, {
      signal,
      onProgress: (step) => activityStore.update(job.id, { step }),
    });
    if (signal.aborted) throw new Error('Import cancelled');

    const resolvedAudio = resolveModel(settings.analyzeModel || settings.chatModel, providers);
    logUsage({ category: 'transcription', sessionId: job.meetingId, provider: resolvedAudio?.provider, model: resolvedAudio?.modelId, usage: audioUsage }).catch(e => console.error('[UsageLog] transcription:', e));

    const meetingSummary = this.buildMeetingSummary(result);

    await transcriptionService.saveTranscriptionResult({
      meetingId: job.meetingId,
      title: result.title,
      transcript: result.transcript,
      summary: meetingSummary,
      categories: result.categories,
      recordingFileName: job.fileName,
      inputSource: 'audio-import',
      model: settings.transcriptionModel,
      segments: result.segments,
      extractionContext: { settings, providers },
    });

    this.debouncedRefresh();
  }

  private buildMeetingSummary(result: import('@shared/types').ProcessedResult): MeetingSummary {
    const ss = result.structuredSummary;
    return {
      overview: ss?.overview || result.summary,
      keyDiscussionPoints: ss?.keyDiscussionPoints || [],
      decisionsMade: ss?.decisionsMade || [],
      actionItems: (ss?.actionItems || []).map(a => ({
        text: a.text,
        owner: a.owner,
        dueDate: a.dueDate,
      })),
      nextSteps: ss?.nextSteps || [],
    };
  }

  /** Debounce history refresh — coalesce rapid completions into one call */
  private debouncedRefresh(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.onMeetingSaved?.();
    }, 500);
  }

  private handleJobUpdate = (jobId: string, status: JobStatus, detail?: string): void => {
    const job = this.jobs.get(jobId);
    if (job) job.status = status;

    switch (status) {
      case 'active':
        activityStore.update(jobId, { status: 'active', detail: 'Starting...' });
        break;
      case 'complete':
        activityStore.update(jobId, { status: 'complete', detail: 'Done' });
        setTimeout(() => activityStore.remove(jobId), AUTO_REMOVE_DELAY);
        this.jobs.delete(jobId);
        break;
      case 'error':
        activityStore.update(jobId, { status: 'error', error: detail || 'Unknown error', detail: null });
        this.jobs.delete(jobId);
        break;
      case 'cancelled':
        activityStore.update(jobId, { status: 'cancelled', detail: 'Cancelled' });
        setTimeout(() => activityStore.remove(jobId), AUTO_REMOVE_DELAY);
        this.jobs.delete(jobId);
        break;
    }
  };
}

export { ImportService };
