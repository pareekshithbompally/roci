/** Dev-only: the native side of a meeting, simulated in the browser (mockIPC), so the real app — screens, pipeline, stores — can
 *  be driven end to end by Playwright. The store follows the same step rules as `meeting_steps.rs`; the recorder sends real
 *  speech (fixtures from `scripts/meeting-harness-fixtures.sh`) as numbered live chunks; Hex transcribes and Apple Intelligence
 *  summarizes with scripted replies. `?scenario=` picks what goes wrong. Not part of the app bundle. */

import { mockIPC, mockWindows } from '@tauri-apps/api/mocks';
import { emit } from '@tauri-apps/api/event';

export type Scenario = 'happy' | 'prose' | 'garbage' | 'dropchunk' | 'sttfail' | 'summaryfail' | 'slowsummary';

interface Line { text: string; pcm: string }
interface Meeting {
  id: string; title: string; title_source: string; status: string; failed_step: string | null; error: string | null;
  created_at: number; updated_at: number; categories: string[]; recording_filename: string | null; step_attempts: number;
}

const log: string[] = [];
const unknown = new Set<string>();
const meetings = new Map<string, Meeting>();
const transcripts = new Map<string, { text: string; model: string | null; segments: string | null; created_at: number }>();
const summaries = new Map<string, { overview: string; data: string; created_at: number; updated_at: number }>();
const notes = new Map<string, Array<{ id: string; text: string; created_at: number; updated_at: number }>>();
const todos: Array<{ id: string; meeting_id: string | null; text: string; owner: string | null; due_date: string | null; completed: boolean; source: string; created_at: number }> = [];
const running = new Set<string>();
const heard: string[] = [];
let recorder: { meetingId: string; startedAt: number; timers: ReturnType<typeof setTimeout>[]; sent: number } | null = null;
let lines: Line[] = [];
let scenario: Scenario = 'happy';

const now = () => Date.now();
const changed = (id: string, deleted = false) => void emit('meeting://changed', { id, deleted });
const setStatus = (m: Meeting, status: string, failedStep: string | null = null, error: string | null = null) => {
  Object.assign(m, { status, failed_step: failedStep, error, updated_at: now() });
};

const SETTINGS: Record<string, unknown> = {
  onboarding: { completed: true },
  liveTranscription: true,
  transcriptionProvider: 'hex',
  transcriptionModel: 'parakeet_unified_en',
  hexIntegration: { enabled: true },
  appleIntelligenceIntegration: { enabled: true },
  analyzeModel: 'apple-intelligence',
  chatModel: 'apple-intelligence',
};

function row(m: Meeting) {
  const { title_source: _source, step_attempts: _attempts, ...rest } = m;
  return { ...rest, input_source: 'systemAndMicrophone', calendar_event_id: null, calendar_meta: null };
}

function detail(id: string) {
  const m = meetings.get(id);
  if (!m) throw { kind: 'not_found', message: 'Meeting not found' };
  const t = transcripts.get(id);
  return {
    ...row(m),
    transcript: t ? { ...t, language: null } : null,
    summary: summaries.get(id) ?? null,
    recordings: m.recording_filename ? [{ id: `r-${id}`, filename: m.recording_filename, duration_seconds: 20, input_source: 'systemAndMicrophone', created_at: m.created_at }] : [],
    notes: notes.get(id) ?? [],
    todos: todos.filter((t) => t.meeting_id === id),
  };
}

/** Pipeline steps, as `meeting_steps.rs` keeps them. */
const steps = {
  begin({ id, step }: { id: string; step: 'transcribe' | 'summarize' }) {
    if (running.has(id)) return false;
    const m = meetings.get(id)!;
    setStatus(m, step === 'transcribe' ? 'transcribing' : 'summarizing');
    m.step_attempts += 1;
    running.add(id);
    changed(id);
    return true;
  },
  end({ id, step, end }: { id: string; step: 'transcribe' | 'summarize'; end: { kind: string; error?: string } }) {
    running.delete(id);
    const m = meetings.get(id)!;
    if (end.kind === 'cancelled') setStatus(m, step === 'transcribe' ? 'captured' : 'transcribed');
    if (end.kind === 'failed') setStatus(m, 'failed', step, end.error ?? '');
    changed(id);
  },
};

function saveSummary({ input }: { input: { meeting_id: string; title: string; overview: string; data: string; categories: string[]; action_items: Array<{ text: string; owner: string | null; due_date: string | null }> } }) {
  const m = meetings.get(input.meeting_id)!;
  summaries.set(m.id, { overview: input.overview, data: input.data, created_at: now(), updated_at: now() });
  if (input.title && ['default', 'ai'].includes(m.title_source)) Object.assign(m, { title: input.title, title_source: 'ai' });
  const removed: string[] = [];
  for (let i = todos.length - 1; i >= 0; i--) if (todos[i].meeting_id === m.id && todos[i].source === 'ai' && !todos[i].completed) removed.push(...todos.splice(i, 1).map((t) => t.id));
  input.action_items.forEach((a) => todos.push({ id: crypto.randomUUID(), meeting_id: m.id, text: a.text, owner: a.owner, due_date: a.due_date, completed: false, source: 'ai', created_at: now() }));
  m.categories = input.categories;
  m.step_attempts = 0;
  setStatus(m, 'ready');
  changed(m.id);
  return removed;
}

/** The recorder: one live chunk of real speech every `gap` ms, numbered; `dropchunk` loses the second in transit. */
function startRecording(args: { title?: string }) {
  const id = `m-${now()}`;
  meetings.set(id, { id, title: args.title || 'Recording', title_source: 'default', status: 'recording', failed_step: null, error: null, created_at: now(), updated_at: now(), categories: [], recording_filename: `${id}.wav`, step_attempts: 0 });
  changed(id);
  const gap = 2_500;
  const timers = lines.map((line, seq) => setTimeout(() => {
    const startMs = seq * 6_000;
    heard.push(line.text);
    if (scenario === 'dropchunk' && seq === 1) return;
    void emit('meeting-live://chunk', { source: 'microphone', startMs, endMs: startMs + 5_000, overlapMs: 0, pcm: line.pcm, seq });
  }, gap * (seq + 1)));
  recorder = { meetingId: id, startedAt: now(), timers, sent: 0 };
  return id;
}

function stopRecording() {
  if (!recorder) return null;
  const { meetingId, timers } = recorder;
  timers.forEach(clearTimeout);
  const sent = heard.length;
  setStatus(meetings.get(meetingId)!, 'captured');
  changed(meetingId);
  recorder = null;
  setTimeout(() => void emit('meeting-live://done', { microphone: sent, system: 0 }), 300);
  return meetingId;
}

/** Hex: a live chunk is the fixture line closest in length (speech detection trims a little silence off each); a whole
 *  recording (longer than any line) is every line heard. */
function hexTranscribe(wav: Uint8Array) {
  if (scenario === 'sttfail') throw { code: 'not-running' };
  const samples = (wav.byteLength - 44) / 2;
  const lengths = lines.map((l) => atob(l.pcm).length / 2);
  if (samples > Math.max(...lengths) * 1.2) return heard.join(' ');
  const nearest = lengths.reduce((best, length, i) => (Math.abs(length - samples) < Math.abs(lengths[best] - samples) ? i : best), 0);
  return lines[nearest].text;
}

/** The recording file: every line spoken so far, one 16 kHz mono WAV. */
function recordingWav(): Uint8Array {
  const pcm = lines.slice(0, Math.max(1, heard.length)).map((l) => Uint8Array.from(atob(l.pcm), (c) => c.charCodeAt(0)));
  const size = pcm.reduce((n, p) => n + p.length, 0);
  const wav = new Uint8Array(44 + size);
  const view = new DataView(wav.buffer);
  const text = (at: number, value: string) => [...value].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  text(0, 'RIFF'); view.setUint32(4, 36 + size, true); text(8, 'WAVE'); text(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, 16_000, true); view.setUint32(28, 32_000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  text(36, 'data'); view.setUint32(40, size, true);
  let at = 44;
  pcm.forEach((p) => { wav.set(p, at); at += p.length; });
  return wav;
}

const SUMMARY = {
  title: 'Hospital data cleanup',
  summary: {
    overview: 'The partial patient definition now counts enrolled data. Duplicate hospital names split the numbers, so Anaya merges them before the dashboard is re-run.',
    keyDiscussionPoints: ['The same hospital appears as Tata Memorial and TMH', 'Numbers split across name variants'],
    decisionsMade: ['Partial patient is counted from enrolled data'],
    actionItems: [{ text: 'Merge the hospital name variants', owner: 'Anaya' }, { text: 'Confirm the definition change with the medical team', owner: 'Parikshit', dueDate: '2026-11-21' }],
    nextSteps: ['Re-run the dashboard once names are merged'],
  },
  categories: ['Work'],
};

async function appleGenerate() {
  if (scenario === 'summaryfail') throw { code: 'unavailable', detail: 'Apple Intelligence is turned off in System Settings.' };
  if (scenario === 'slowsummary') await new Promise((r) => setTimeout(r, 8_000));
  if (scenario === 'prose') return `Sure! Here is the summary:\n\`\`\`json\n${JSON.stringify(SUMMARY)}\n\`\`\`\nLet me know if you need more.`;
  if (scenario === 'garbage') return JSON.stringify({ title: 'Half a reply', summary: { overview: 'Only an overview came back.', keyDiscussionPoints: 'not a list', actionItems: [{ owner: 'nobody' }] } });
  return JSON.stringify(SUMMARY);
}

const HANDLERS: Record<string, (args: never) => unknown> = {
  'plugin:store|initialize': () => null,
  'system_format': () => ({ locale: 'en-IN', hour24: false, first_weekday: 2, min_days_in_first_week: 1 }),
  'local_models': () => [],
  'plugin:path|resolve_directory': () => '/tmp/roci-harness',
  'plugin:fs|exists': () => true,
  'plugin:fs|mkdir': () => null,
  'plugin:store|settings_get_all': () => Object.entries(SETTINGS).map(([key, value]) => ({ key, value: JSON.stringify(value) })),
  'plugin:store|providers_list': () => [],
  'plugin:store|meetings_list': () => ({ items: [...meetings.values()].sort((a, b) => b.created_at - a.created_at).map(row), total: meetings.size }),
  'plugin:store|meetings_get': ({ id }: { id: string }) => detail(id),
  'plugin:store|meetings_begin_step': steps.begin,
  'plugin:store|meetings_end_step': steps.end,
  'plugin:store|meetings_rename': ({ id, title }: { id: string; title: string }) => { Object.assign(meetings.get(id)!, { title, title_source: 'user' }); changed(id); },
  'plugin:store|transcripts_save': ({ input }: { input: { meeting_id: string; text: string; model: string | null; segments: string | null } }) => {
    transcripts.set(input.meeting_id, { text: input.text, model: input.model, segments: input.segments, created_at: now() });
    const m = meetings.get(input.meeting_id)!;
    m.step_attempts = 0;
    setStatus(m, 'transcribed');
    changed(m.id);
  },
  'plugin:store|summaries_save': saveSummary,
  'plugin:store|notes_list': ({ meetingId }: { meetingId: string }) => notes.get(meetingId) ?? [],
  'plugin:store|notes_upsert': ({ input }: { input: { id: string; meeting_id: string; text: string } }) => {
    const list = notes.get(input.meeting_id) ?? [];
    notes.set(input.meeting_id, [...list.filter((n) => n.id !== input.id), { id: input.id, text: input.text, created_at: now(), updated_at: now() }]);
    changed(input.meeting_id);
  },
  'plugin:store|todos_list_for_meeting': ({ meetingId }: { meetingId: string }) => todos.filter((t) => t.meeting_id === meetingId).map((t) => ({ ...t, meeting_title: meetings.get(meetingId)?.title ?? null, reminder: null })),
  'plugin:store|todos_list_global': () => ({ items: [], total: 0 }),
  'plugin:store|chats_list': () => ({ items: [], total: 0 }),
  'plugin:store|categories_list': () => [],
  'plugin:store|get_meeting_usage': () => [],
  'start_audio_capture': (args: { title?: string }) => startRecording(args),
  'stop_audio_capture': () => stopRecording(),
  'recorder_state': () => (recorder ? { state: 'recording', meetingId: recorder.meetingId, recordedMs: now() - recorder.startedAt, paused: false } : { state: 'idle' }),
  'recover_meetings': () => [],
  'meeting_echo_signals': ({ spans }: { spans: unknown[] }) => spans.map(() => null),
  'hex_status': () => ({ running: true, models: [{ id: 'parakeet_unified_en', name: 'Parakeet', installed: true }] }),
  'hex_transcribe': (wav: Uint8Array) => hexTranscribe(wav),
  'plugin:apple-intelligence|availability': () => ({ availability: 'available', context_tokens: 4_096 }),
  'plugin:apple-intelligence|generate': () => appleGenerate(),
  'plugin:fs|read_file': () => recordingWav(),
  'plugin:path|join': ({ paths }: { paths: string[] }) => paths.join('/'),
};

/** What the page did, for Playwright to read: every command, and the ones nothing here answers. */
declare global {
  interface Window { __harness: { log: string[]; unknown: string[]; scenario: Scenario } }
}

export async function installFakeNative(): Promise<void> {
  scenario = (new URLSearchParams(location.search).get('scenario') as Scenario | null) ?? 'happy';
  lines = ((await (await fetch(new URL('./fixtures/speech.json', import.meta.url))).json()) as { lines: Line[] }).lines;
  window.__harness = { log, unknown: [], scenario };
  mockIPC(async (cmd, args) => {
    log.push(cmd);
    const handler = HANDLERS[cmd];
    if (handler) return handler(args as never);
    if (!unknown.has(cmd)) {
      unknown.add(cmd);
      window.__harness.unknown.push(cmd);
    }
    return null;
  }, { shouldMockEvents: true });
  mockWindows('main');
  // the path API reads its separators from the native side's plugin data
  Object.assign((window as unknown as { __TAURI_INTERNALS__: { plugins?: object } }).__TAURI_INTERNALS__, { plugins: { path: { sep: '/', delimiter: ':' } } });
}
