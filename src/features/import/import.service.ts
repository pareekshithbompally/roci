/** Non-React singleton for imports: dialog → read → create the meeting → hand it to the meeting pipeline. */

import type { AppSettings } from '@shared/types';
import { UI_CONFIG } from '@config/ui.config';
import { dialogService } from '@services/tauri/dialog.service';
import { fileSystemService } from '@services/tauri/fileSystem.service';
import { store } from '@services/db';
import { recordingsService } from '@services/storage';
import { transcriptionService } from '@services/transcription.service';
import { meetingPipeline } from '@features/recording';
import { activityStore } from '@shared/stores/activityStore';
import { IMPORT_CONFIG } from '@config/audio.config';
import { parseSubtitleFile } from './parsers/subtitle-parser';
import { JobQueue } from './job-queue';
import type { ImportJob, JobStatus } from './types';


/** A file name without its extension, as the meeting's first title. */
const titleOf = (fileName: string): string => fileName.replace(/\.[^.]+$/, '');

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

  async importTranscripts(): Promise<void> {
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
        execute: (signal) => this.processTranscript(job, signal),
      });
    }
  }

  async importAudio(): Promise<void> {
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
        execute: (signal) => this.processAudio(job, signal),
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

  /** The meeting is created as `transcribed`; the pipeline writes its summary. */
  private async processTranscript(job: ImportJob, signal: AbortSignal): Promise<void> {
    activityStore.update(job.id, { detail: 'Reading file...' });
    const text = await fileSystemService.readTextFile(job.filePath);
    if (signal.aborted) throw new Error('Import cancelled');

    const format = job.filePath.endsWith('.vtt') ? 'vtt' : 'srt';
    await transcriptionService.importMeeting(
      { id: job.meetingId, title: titleOf(job.fileName), inputSource: 'transcript-import' },
      { text: parseSubtitleFile(text, format) },
    );
    this.handOff(job.meetingId);
  }

  /** The file is copied into recordings and the meeting created as `captured`; the pipeline transcribes it. */
  private async processAudio(job: ImportJob, signal: AbortSignal): Promise<void> {
    activityStore.update(job.id, { detail: 'Reading file...' });
    const bytes = await fileSystemService.readFile(job.filePath);
    if (signal.aborted) throw new Error('Import cancelled');

    if (bytes.length > IMPORT_CONFIG.audio.maxSizeBytes) {
      throw new Error(
        `File too large (${(bytes.length / 1024 / 1024).toFixed(1)}MB). Max: ${IMPORT_CONFIG.audio.maxSizeMB}MB`,
      );
    }

    const extension = job.filePath.split('.').pop()?.toLowerCase() ?? 'wav';
    const recordingFilename = `${job.meetingId}.${extension}`;
    await recordingsService.writeRecording(recordingFilename, bytes);
    await store.meetings.create({
      id: job.meetingId,
      title: titleOf(job.fileName),
      status: 'captured',
      inputSource: 'audio-import',
      recordingFilename,
    });
    this.handOff(job.meetingId);
  }

  /** The meeting is in the sidebar; transcription and summary run (and report) in the pipeline. */
  private handOff(meetingId: string): void {
    this.debouncedRefresh();
    void meetingPipeline.run(meetingId);
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
        setTimeout(() => activityStore.remove(jobId), UI_CONFIG.activityTray.autoRemoveDelay);
        this.jobs.delete(jobId);
        break;
      case 'error':
        activityStore.update(jobId, { status: 'error', error: detail || 'Unknown error', detail: null });
        this.jobs.delete(jobId);
        break;
      case 'cancelled':
        activityStore.update(jobId, { status: 'cancelled', detail: 'Cancelled' });
        setTimeout(() => activityStore.remove(jobId), UI_CONFIG.activityTray.autoRemoveDelay);
        this.jobs.delete(jobId);
        break;
    }
  };
}

export { ImportService };
