/** Speech model catalog: what can be picked, whether it can run now, and which adapter and credentials run it. */

import { TRANSCRIPTION_CONFIG } from '@config/transcription.config';
import { isSpeechOnly, jobRecords, modelKey, transcribeAdapter } from '@services/ai/models';
import { formatFileSize } from '@shared/utils/formatters';
import { installedHexModels } from './hex';
import { appleSpeechHint, isAppleSpeechReady } from './appleSpeech';
import type { AppleSpeechStatus } from '@services/ai/apple/appleIntelligence.service';
import type { TranscriptionAdapterId } from '@config/transcription.config';
import type { ModelProvider } from '@shared/types/modelProviders';
import type { HexStatus } from './hex';
import type { LocalModel } from '@services/localModels.service';
import type { SpeechSelection } from './types';

export interface SpeechModelOption extends SpeechSelection {
  label: string;
  ready: boolean;
  /** Known to stream (a local engine's own catalog says so); a cloud model is found out by trying its stream. */
  live: boolean;
  /** Short next step when not ready ("Add OpenAI API key", "Open Hex"). */
  hint: string | null;
}

const { hexProvider, keylessProviders, speechEndpointByProvider } = TRANSCRIPTION_CONFIG;

/** A provider speech model as the spine describes it (fit, readiness), or undefined when it isn't one. */
function speechRecord(selection: SpeechSelection, providers: ModelProvider[]) {
  return speechRecords(providers).find((r) => r.provider === selection.provider && r.id === selection.model);
}

/** Speech lists the speech models the user added; a chat model that hears joins only when its Audio input is ticked (its ⋯ menu). */
function speechRecords(providers: ModelProvider[]) {
  const ticked = new Set(providers.flatMap((p) => (p.models ?? []).filter((m) => m.overrides?.audio).map((m) => modelKey({ provider: p.provider, model: m.id }))));
  return jobRecords(providers, 'transcribe').filter((r) => isSpeechOnly(r) || ticked.has(modelKey({ provider: r.provider, model: r.id })));
}

/** Keyless engines run on their own endpoint; any other speech model runs the way the spine routes it. */
export function adapterFor(selection: SpeechSelection, providers: ModelProvider[]): TranscriptionAdapterId | null {
  if (keylessProviders.includes(selection.provider)) return speechEndpointByProvider[selection.provider] ?? null;
  const record = speechRecord(selection, providers);
  return record ? transcribeAdapter(record) : null;
}

/** The speech-to-text models the user added, as the spine describes them. */
function providerOptions(providers: ModelProvider[]): SpeechModelOption[] {
  return speechRecords(providers).map((r) => ({
    provider: r.provider, model: r.id, label: r.label, ready: r.ready, hint: r.hint, live: false,
  }));
}

function hexOptions(status: HexStatus | undefined): SpeechModelOption[] {
  const installed = installedHexModels(status).filter((m) => !TRANSCRIPTION_CONFIG.hiddenHexModels.includes(m.id));
  if (installed.length > 0) {
    return installed.map((m) => ({ provider: hexProvider, model: m.id, label: m.name, ready: true, hint: null, live: false }));
  }
  const hint = status?.running ? 'Download a model in Hex' : 'Open Hex';
  return [{ provider: hexProvider, model: '', label: 'Hex', ready: false, hint, live: false }];
}

/** Keyless speech sources; an integration is present only while it's on, and absent offers nothing. */
export interface SpeechSources {
  onDevice?: { models: LocalModel[] };
  hex?: { status: HexStatus | undefined };
  appleSpeech?: { status: AppleSpeechStatus | undefined };
}

/** Roci's engine: every curated model; one not downloaded yet shows its size. */
function onDeviceOptions(models: LocalModel[]): SpeechModelOption[] {
  const { provider } = TRANSCRIPTION_CONFIG.onDevice;
  return models.map((m) => ({
    provider,
    model: m.id,
    label: m.name,
    ready: m.installed,
    hint: m.installed ? null : formatFileSize(m.bytes),
    live: m.streams,
  }));
}

function appleSpeechOptions(status: AppleSpeechStatus | undefined): SpeechModelOption[] {
  const { provider, model, label } = TRANSCRIPTION_CONFIG.appleSpeech;
  return [{ provider, model, label, ready: isAppleSpeechReady(status), hint: appleSpeechHint(status), live: true }];
}

/** Every speech model in picker order, on-device first; the first entry per selection wins. */
export function speechModelOptions(providers: ModelProvider[], sources: SpeechSources): SpeechModelOption[] {
  const options = [
    ...(sources.appleSpeech ? appleSpeechOptions(sources.appleSpeech.status) : []),
    ...(sources.onDevice ? onDeviceOptions(sources.onDevice.models) : []),
    ...(sources.hex ? hexOptions(sources.hex.status) : []),
    ...providerOptions(providers),
  ];
  return uniqueBySelection(options);
}

/** One option per selection; the first listed wins. */
function uniqueBySelection(options: SpeechModelOption[]): SpeechModelOption[] {
  const byKey = new Map<string, SpeechModelOption>();
  for (const option of options) {
    const key = modelKey(option);
    if (!byKey.has(key)) byKey.set(key, option);
  }
  return [...byKey.values()];
}

/** Whether the selection can transcribe right now. */
export function isSpeechSelectionReady(
  selection: SpeechSelection | null,
  providers: ModelProvider[],
  sources: SpeechSources,
): boolean {
  if (!selection || !adapterFor(selection, providers)) return false;
  if (selection.provider === hexProvider) return !!sources.hex && installedHexModels(sources.hex.status).length > 0;
  if (selection.provider === TRANSCRIPTION_CONFIG.appleSpeech.provider) {
    return !!sources.appleSpeech && isAppleSpeechReady(sources.appleSpeech.status);
  }
  if (selection.provider === TRANSCRIPTION_CONFIG.onDevice.provider) {
    return !!sources.onDevice?.models.some((m) => m.id === selection.model && m.installed);
  }
  return speechRecord(selection, providers)?.ready ?? false;
}

/** First-run choice: the first speech model the user added that can run. */
export function defaultSpeechSelection(providers: ModelProvider[]): SpeechSelection | null {
  const first = speechRecords(providers).find((r) => r.ready);
  return first ? { provider: first.provider, model: first.id } : null;
}

/** The saved selection, or null when none was chosen. */
export function speechSelectionOf(settings: { transcriptionProvider?: string; transcriptionModel?: string }): SpeechSelection | null {
  if (!settings.transcriptionProvider) return null;
  return { provider: settings.transcriptionProvider, model: settings.transcriptionModel ?? '' };
}
