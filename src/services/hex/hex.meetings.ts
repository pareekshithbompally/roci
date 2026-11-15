/** Wrappers over the Hex integration's Rust commands; read-only, Kasset never writes to Hex. */

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

/** Mirrors the Rust `HexMeeting` (Hex CLI JSON v1). */
export interface HexMeeting {
  id: string;
  title: string;
  timestamp_ms: number;
  duration_ms: number;
  status: 'starting' | 'recording' | 'transcribing' | 'complete' | 'interrupted' | 'failed';
  in_progress: boolean;
}

/** One transcript line; `microphone` is you, `system` the other participants. */
export interface HexEntry {
  source: 'microphone' | 'system';
  start_ms: number;
  end_ms: number;
  text: string;
}

export interface HexMeetingDetail {
  meeting: HexMeeting;
  notes: { title: string; summary: string } | null;
  entries: HexEntry[];
}

/** Mirrors the Rust `EventsState`: what the meeting-finished watcher is doing. */
export type HexEventsState = 'live' | 'labs-off' | 'waiting';

export const hexMeetings = {
  list: () => invoke<HexMeeting[]>('hex_meetings_list'),
  show: (id: string) => invoke<HexMeetingDetail>('hex_meeting_show', { id }),
  /** Starts or stops the meeting-finished watcher. */
  watch: (on: boolean) => invoke<void>('hex_watch', { on }),
  onFinished: (listener: (id: string) => void): Promise<UnlistenFn> =>
    listen<{ id: string }>('hex://meeting-finished', (event) => listener(event.payload.id)),
  onEventsState: (listener: (state: HexEventsState) => void): Promise<UnlistenFn> =>
    listen<HexEventsState>('hex://events', (event) => listener(event.payload)),
};
