/** The in-call transcript: the recording's own chunks (mic and system audio, from Rust) transcribed in order with the chosen
 *  speech model; on Stop it becomes the meeting's transcript when every chunk was transcribed. */

import { listen } from '@tauri-apps/api/event';
import { MEETING_LIVE_CONFIG as LIVE, type MeetingSourceId } from '@config/meetingLive.config';
import { runTranscription, speechSelectionOf } from '@services/ai/transcription';
import type { TranscriptResult } from '@services/ai/transcription';
import { encodeWavInt16 } from '@shared/utils/wav.utils';
import type { AppSettings } from '@shared/types';
import type { ModelProvider } from '@shared/types/modelProviders';
import { meetingLiveActions } from './meetingLiveStore';

/** One transcribed chunk of one source, on the recording's timeline. */
export interface LiveEntry {
  source: MeetingSourceId;
  startMs: number;
  endMs: number;
  text: string;
}

interface LiveChunk {
  source: MeetingSourceId;
  startMs: number;
  endMs: number;
  pcm: string;
}

interface Session {
  meetingId: string;
  entries: LiveEntry[];
  failed: boolean;
  queue: Promise<void>;
  done: Promise<void>;
  unlisten: () => void;
}

/** What the recording left: its entries, and whether every chunk was transcribed. */
export interface LiveOutcome {
  entries: LiveEntry[];
  complete: boolean;
}

let session: Session | null = null;

function wavOf(pcm: string): Blob {
  const bytes = Uint8Array.from(atob(pcm), (c) => c.charCodeAt(0));
  const ints = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
  const samples = Float32Array.from(ints, (s) => s / 32_768);
  return new Blob([encodeWavInt16(samples, LIVE.sampleRate)], { type: 'audio/wav' });
}

async function transcribeChunk(current: Session, chunk: LiveChunk, read: () => { settings: AppSettings; providers: ModelProvider[] }): Promise<void> {
  const { settings, providers } = read();
  const selection = speechSelectionOf(settings);
  if (!selection) {
    current.failed = true;
    return;
  }
  try {
    const { text } = await runTranscription(wavOf(chunk.pcm), selection, providers);
    if (session !== current || !text.trim()) return;
    current.entries.push({ source: chunk.source, startMs: chunk.startMs, endMs: chunk.endMs, text: text.trim() });
    meetingLiveActions.set(dropEchoes(current.entries));
  } catch (error: unknown) {
    console.error('[liveTranscript] chunk failed:', error);
    current.failed = true;
  }
}

/** Entries in time order, without the microphone's echo of what the speakers played. */
export function dropEchoes(entries: LiveEntry[]): LiveEntry[] {
  const words = (text: string) => new Set(text.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? []);
  const system = entries.filter((e) => e.source === 'system');
  const isEcho = (mic: LiveEntry) => {
    const said = words(mic.text);
    return said.size > 0 && system.some((s) => s.startMs < mic.endMs && mic.startMs < s.endMs
      && [...said].filter((w) => words(s.text).has(w)).length / said.size >= LIVE.echoWordShare);
  };
  return entries.filter((e) => e.source !== 'microphone' || !isEcho(e)).sort((a, b) => a.startMs - b.startMs);
}

/** The entries as a transcript: one segment per entry, labelled by who said it. */
export function liveTranscriptResult(entries: LiveEntry[]): TranscriptResult {
  const segments = entries.map((e) => ({ text: e.text, startSecond: e.startMs / 1_000, endSecond: e.endMs / 1_000, speaker: LIVE.speakers[e.source] }));
  return { text: segments.map((s) => s.text).join(' '), segments };
}

export const liveTranscript = {
  /** Starts listening for a recording's chunks; any earlier session (an abandoned recording) is dropped. */
  async start(meetingId: string, read: () => { settings: AppSettings; providers: ModelProvider[] }): Promise<void> {
    session?.unlisten();
    meetingLiveActions.start(meetingId);
    let finished: () => void = () => undefined;
    const current: Session = { meetingId, entries: [], failed: false, queue: Promise.resolve(), done: new Promise((r) => { finished = r; }), unlisten: () => undefined };
    session = current;
    const offChunk = await listen<LiveChunk>(LIVE.chunkEvent, ({ payload }) => {
      meetingLiveActions.working(true);
      current.queue = current.queue
        .then(() => transcribeChunk(current, payload, read))
        .finally(() => { if (session === current) meetingLiveActions.working(false); });
    });
    const offDone = await listen(LIVE.doneEvent, () => finished());
    current.unlisten = () => { offChunk(); offDone(); };
  },

  /** After Stop: waits for the last chunks, then gives the recording's entries (null when it had no session). */
  async finish(meetingId: string): Promise<LiveOutcome | null> {
    const current = session;
    if (!current || current.meetingId !== meetingId) return null;
    await current.done;
    await current.queue;
    current.unlisten();
    session = null;
    meetingLiveActions.stop();
    return { entries: dropEchoes(current.entries), complete: !current.failed };
  },
};
