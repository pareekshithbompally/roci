/**
 * Job Queue — Generic async job queue with concurrency control.
 *
 * Plain TypeScript, no React dependency.
 * Each job gets its own AbortController for cancellation.
 */

import type { JobStatus } from './types';

export interface Job<T> {
  id: string;
  label: string;
  execute: (signal: AbortSignal) => Promise<T>;
}

export interface JobQueueOptions {
  concurrency: number;
  onJobUpdate: (jobId: string, status: JobStatus, detail?: string) => void;
  onComplete: () => void;
}

interface InternalJob<T> extends Job<T> {
  status: JobStatus;
  controller: AbortController;
}

export class JobQueue<T> {
  private queue: InternalJob<T>[] = [];
  private active = new Map<string, InternalJob<T>>();
  private concurrency: number;
  private onJobUpdate: JobQueueOptions['onJobUpdate'];
  private onComplete: JobQueueOptions['onComplete'];

  constructor(options: JobQueueOptions) {
    this.concurrency = options.concurrency;
    this.onJobUpdate = options.onJobUpdate;
    this.onComplete = options.onComplete;
  }

  enqueue(job: Job<T>): void {
    const internal: InternalJob<T> = {
      ...job,
      status: 'queued',
      controller: new AbortController(),
    };
    this.queue.push(internal);
    this.onJobUpdate(job.id, 'queued');
    this.drain();
  }

  abort(jobId: string): void {
    // Check active jobs
    const activeJob = this.active.get(jobId);
    if (activeJob) {
      activeJob.controller.abort();
      activeJob.status = 'cancelled';
      this.active.delete(jobId);
      this.onJobUpdate(jobId, 'cancelled');
      this.drain();
      return;
    }

    // Check queued jobs
    const idx = this.queue.findIndex(j => j.id === jobId);
    if (idx !== -1) {
      const job = this.queue[idx];
      this.queue.splice(idx, 1);
      job.status = 'cancelled';
      this.onJobUpdate(jobId, 'cancelled');
    }
  }

  abortAll(): void {
    // Cancel all active
    for (const [id, job] of this.active) {
      job.controller.abort();
      job.status = 'cancelled';
      this.onJobUpdate(id, 'cancelled');
    }
    this.active.clear();

    // Cancel all queued
    for (const job of this.queue) {
      job.status = 'cancelled';
      this.onJobUpdate(job.id, 'cancelled');
    }
    this.queue = [];
  }

  updateConcurrency(n: number): void {
    this.concurrency = n;
    // If concurrency increased, drain may start more jobs
    this.drain();
  }

  get pendingCount(): number {
    return this.queue.length + this.active.size;
  }

  private drain(): void {
    while (this.active.size < this.concurrency && this.queue.length > 0) {
      const job = this.queue.shift()!;
      this.runJob(job);
    }

    if (this.active.size === 0 && this.queue.length === 0) {
      this.onComplete();
    }
  }

  private async runJob(job: InternalJob<T>): Promise<void> {
    job.status = 'active';
    this.active.set(job.id, job);
    this.onJobUpdate(job.id, 'active');

    try {
      await job.execute(job.controller.signal);
      if (job.controller.signal.aborted) {
        job.status = 'cancelled';
        this.onJobUpdate(job.id, 'cancelled');
      } else {
        job.status = 'complete';
        this.onJobUpdate(job.id, 'complete');
      }
    } catch (error: unknown) {
      if (job.controller.signal.aborted) {
        job.status = 'cancelled';
        this.onJobUpdate(job.id, 'cancelled');
      } else {
        job.status = 'error';
        const message = error instanceof Error ? error.message : 'Unknown error';
        this.onJobUpdate(job.id, 'error', message);
      }
    } finally {
      this.active.delete(job.id);
      this.drain();
    }
  }
}
