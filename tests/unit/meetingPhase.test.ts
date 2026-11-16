import { describe, it, expect, beforeEach } from 'vitest';
import { deriveMeetingPhase, isMeetingBusy } from '@shared/types/meetingPhase';
import { meetingProgress, useMeetingProgressStore } from '@shared/stores/meetingProgressStore';
import { meetingPhaseAction, meetingPhaseLabel, meetingPhaseDetail } from '@config/meetingPhase.config';

describe('deriveMeetingPhase', () => {
  it('is ready when the meeting has no status', () => {
    expect(deriveMeetingPhase(undefined)).toEqual({ kind: 'ready' });
  });

  it('maps each stored status onto its phase', () => {
    expect(deriveMeetingPhase({ status: 'recording' })).toEqual({ kind: 'recording' });
    expect(deriveMeetingPhase({ status: 'captured' })).toEqual({ kind: 'pending' });
    expect(deriveMeetingPhase({ status: 'transcribed' })).toEqual({ kind: 'transcribed' });
    expect(deriveMeetingPhase({ status: 'summarizing' })).toEqual({ kind: 'summarizing' });
    expect(deriveMeetingPhase({ status: 'ready' })).toEqual({ kind: 'ready' });
  });

  it('adds live part progress while transcribing', () => {
    const part = { current: 2, total: 5 };
    expect(deriveMeetingPhase({ status: 'transcribing' }, part)).toEqual({ kind: 'transcribing', part });
    expect(deriveMeetingPhase({ status: 'transcribing' })).toEqual({ kind: 'transcribing', part: null });
  });

  it('keeps the failed step and message', () => {
    expect(deriveMeetingPhase({ status: 'failed', failedStep: 'summarize', error: 'quota' }))
      .toEqual({ kind: 'failed', failedAt: 'summarize', message: 'quota' });
  });

  it('recording, transcribing and summarizing count as busy', () => {
    expect(isMeetingBusy({ kind: 'recording' })).toBe(true);
    expect(isMeetingBusy({ kind: 'transcribing', part: null })).toBe(true);
    expect(isMeetingBusy({ kind: 'summarizing' })).toBe(true);
    expect(isMeetingBusy({ kind: 'failed', failedAt: 'transcribe', message: 'x' })).toBe(false);
    expect(isMeetingBusy({ kind: 'pending' })).toBe(false);
    expect(isMeetingBusy({ kind: 'ready' })).toBe(false);
  });
});

describe('meetingProgressStore', () => {
  beforeEach(() => useMeetingProgressStore.setState({ parts: {} }));

  it('clear removes only that meeting and is a no-op when absent', () => {
    meetingProgress.set('m1', { current: 1, total: 2 });
    meetingProgress.set('m2', { current: 1, total: 3 });
    const before = useMeetingProgressStore.getState().parts;
    meetingProgress.clear('missing');
    expect(useMeetingProgressStore.getState().parts).toBe(before);
    meetingProgress.clear('m1');
    expect(Object.keys(useMeetingProgressStore.getState().parts)).toEqual(['m2']);
  });
});

describe('meeting phase copy', () => {
  it('labels every phase, with part progress when known', () => {
    expect(meetingPhaseLabel({ kind: 'transcribing', part: { current: 2, total: 5 } })).toBe('Transcribing 2/5');
    expect(meetingPhaseLabel({ kind: 'transcribing', part: null })).toBe('Transcribing');
    expect(meetingPhaseLabel({ kind: 'failed', failedAt: 'summarize', message: 'x' })).toBe("Couldn't summarize");
    expect(meetingPhaseLabel({ kind: 'pending' })).toBe('Not transcribed');
    expect(meetingPhaseLabel({ kind: 'transcribed' })).toBe('Not summarized');
  });

  it('offers one action per phase: Cancel while running, none for a failed recording', () => {
    expect(meetingPhaseAction({ kind: 'pending' })).toBe('Transcribe');
    expect(meetingPhaseAction({ kind: 'transcribed' })).toBe('Summarize');
    expect(meetingPhaseAction({ kind: 'failed', failedAt: 'transcribe', message: 'x' })).toBe('Retry');
    expect(meetingPhaseAction({ kind: 'failed', failedAt: 'record', message: 'x' })).toBeNull();
    expect(meetingPhaseAction({ kind: 'ready' })).toBe('Re-transcribe');
    expect(meetingPhaseAction({ kind: 'summarizing' })).toBe('Cancel');
    expect(meetingPhaseAction({ kind: 'recording' })).toBeNull();
  });

  it('shows the failure message as the detail, nothing when ready', () => {
    expect(meetingPhaseDetail({ kind: 'failed', failedAt: 'transcribe', message: 'No API key' })).toBe('No API key');
    expect(meetingPhaseDetail({ kind: 'ready' })).toBeNull();
  });
});
