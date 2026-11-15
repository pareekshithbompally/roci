export type ImportSource = 'audio' | 'transcript';

export type JobStatus = 'queued' | 'active' | 'complete' | 'error' | 'cancelled';

export interface ImportJob {
  id: string;
  filePath: string;
  fileName: string;
  source: ImportSource;
  meetingId: string;
  status: JobStatus;
  error?: string;
}
