export interface ContextInput {
  /** The meetings attached to the question being asked. */
  meetingIds: string[];
  signal?: AbortSignal;
}

export interface ContextOutput {
  text: string;
  provider: string;
  confidence: number;
  durationMs: number;
  meta?: Record<string, unknown>;
}

/** Structured result from ContextPipeline.resolve() */
export interface ContextPipelineResult {
  text: string;
  mentionedMeetingIds?: string[];
}

export interface ContextProvider {
  readonly name: string;
  readonly priority: number;
  shouldRun(input: ContextInput): boolean;
  resolve(input: ContextInput): Promise<ContextOutput>;
}
