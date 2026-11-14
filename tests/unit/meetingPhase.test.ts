import { describe, it, expect, beforeEach } from 'vitest';
import { deriveMeetingPhase, isMeetingBusy } from '@shared/types/meetingPhase';
import { meetingJobs, useMeetingJobsStore } from '@shared/stores/meetingJobsStore';

describe('deriveMeetingPhase', () => {
  it('is ready with no job and no pending flag', () => {
    expect(deriveMeetingPhase(undefined, {})).toEqual({ kind: 'ready' });
    expect(deriveMeetingPhase(undefined, null)).toEqual({ kind: 'ready' });
  });

  it('is pending when the recording was never transcribed', () => {
    expect(deriveMeetingPhase(undefined, { pendingTranscription: true })).toEqual({ kind: 'pending' });
  });

  it('a running job wins over the persisted flag', () => {
    const part = { current: 2, total: 5 };
    expect(deriveMeetingPhase({ stage: 'transcribing', part }, { pendingTranscription: true }))
      .toEqual({ kind: 'transcribing', part });
    expect(deriveMeetingPhase({ stage: 'summarizing' }, { pendingTranscription: true }))
      .toEqual({ kind: 'summarizing' });
  });

  it('keeps the failed stage and message', () => {
    expect(deriveMeetingPhase({ stage: 'failed', failedAt: 'summarize', message: 'quota' }, { pendingTranscription: true }))
      .toEqual({ kind: 'failed', failedAt: 'summarize', message: 'quota' });
  });

  it('only transcribing and summarizing count as busy', () => {
    expect(isMeetingBusy({ kind: 'transcribing', part: null })).toBe(true);
    expect(isMeetingBusy({ kind: 'summarizing' })).toBe(true);
    expect(isMeetingBusy({ kind: 'failed', failedAt: 'transcribe', message: 'x' })).toBe(false);
    expect(isMeetingBusy({ kind: 'pending' })).toBe(false);
    expect(isMeetingBusy({ kind: 'ready' })).toBe(false);
  });
});

describe('meetingJobsStore', () => {
  beforeEach(() => useMeetingJobsStore.setState({ jobs: {} }));

  it('one shared copy: a job set anywhere is visible everywhere', () => {
    meetingJobs.set('m1', { stage: 'summarizing' });
    expect(useMeetingJobsStore.getState().jobs.m1).toEqual({ stage: 'summarizing' });
  });

  it('clear removes only that meeting and is a no-op when absent', () => {
    meetingJobs.set('m1', { stage: 'summarizing' });
    meetingJobs.set('m2', { stage: 'transcribing', part: null });
    const before = useMeetingJobsStore.getState().jobs;
    meetingJobs.clear('missing');
    expect(useMeetingJobsStore.getState().jobs).toBe(before);
    meetingJobs.clear('m1');
    expect(Object.keys(useMeetingJobsStore.getState().jobs)).toEqual(['m2']);
  });
});

import { meetingPhaseAction, meetingPhaseLabel, meetingPhaseDetail } from '@config/meetingPhase.config';

describe('meeting phase copy', () => {
  it('labels every phase, with part progress when known', () => {
    expect(meetingPhaseLabel({ kind: 'transcribing', part: { current: 2, total: 5 } })).toBe('Transcribing 2/5');
    expect(meetingPhaseLabel({ kind: 'transcribing', part: null })).toBe('Transcribing');
    expect(meetingPhaseLabel({ kind: 'failed', failedAt: 'summarize', message: 'x' })).toBe("Couldn't summarize");
    expect(meetingPhaseLabel({ kind: 'pending' })).toBe('Not transcribed');
  });

  it('offers one action per phase and none while busy', () => {
    expect(meetingPhaseAction({ kind: 'pending' })).toBe('Transcribe');
    expect(meetingPhaseAction({ kind: 'failed', failedAt: 'transcribe', message: 'x' })).toBe('Retry');
    expect(meetingPhaseAction({ kind: 'ready' })).toBe('Re-transcribe');
    expect(meetingPhaseAction({ kind: 'summarizing' })).toBeNull();
  });

  it('shows the failure message as the detail, nothing when ready', () => {
    expect(meetingPhaseDetail({ kind: 'failed', failedAt: 'transcribe', message: 'No API key' })).toBe('No API key');
    expect(meetingPhaseDetail({ kind: 'ready' })).toBeNull();
  });
});
