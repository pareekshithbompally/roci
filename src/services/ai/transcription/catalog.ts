/**
 * Speech model catalog — what the user can pick, whether it can run now, and
 * which adapter and credentials run it. Single rule used by Settings › Capabilities,
 * the composer's mic, the menubar, and the pipeline.
 */

import { TRANSCRIPTION_CONFIG } from '@config/transcription.config';
import { capabilitiesOf } from '@services/ai/capabilities';
import { resolveProviderModel } from '@shared/utils/modelResolver';
import { getProviderTitle, isLocalProviderId } from '@shared/utils/provider.utils';
import { credentialsError } from './cred';
import { formatFileSize } from '@shared/utils/formatters';
import { installedHexModels } from './hex';
import { appleSpeechHint, isAppleSpeechReady } from './appleSpeech';
import type { AppleSpeechStatus } from '@services/ai/apple/appleIntelligence.service';
import type { TranscriptionAdapterId } from '@config/transcription.config';
import type { Model, ModelProvider } from '@shared/types/modelProviders';
import type { HexStatus } from './hex';
import type { LocalModel } from '@services/localModels.service';
import type { SpeechSelection } from './types';

export interface SpeechModelOption extends SpeechSelection {
  label: string;
  ready: boolean;
  /** Can transcribe dictation while it's spoken (an engine with a live mode, on a model that streams). */
  live: boolean;
  /** Short next step when not ready ("Add OpenAI API key", "Open Hex"). */
  hint: string | null;
}

const { hexProvider, keylessProviders, localSpeechModelPattern, providerModels, speechEndpointByProvider } = TRANSCRIPTION_CONFIG;

/** The adapter a speech model runs on by config: keyless engines, local speech models, curated cloud models. */
function speechModelAdapter({ provider, model }: SpeechSelection): TranscriptionAdapterId | null {
  if (keylessProviders.includes(provider)) return speechEndpointByProvider[provider] ?? null;
  if (isLocalProviderId(provider)) return localSpeechModelPattern.test(model) ? 'openai-compatible' : null;
  if (!providerModels[provider]?.some((m) => m.id === model)) return null;
  return speechEndpointByProvider[provider] ?? 'multimodal';
}

function acceptsAudio({ provider, model }: SpeechSelection, providers: ModelProvider[]): boolean {
  const resolved = resolveProviderModel(provider, model, providers);
  return !!resolved && capabilitiesOf(provider, resolved.model).audioInput;
}

/**
 * Which adapter transcribes a selection: the speech endpoint for speech models,
 * else the multimodal prompt for any model that accepts audio, else none.
 */
export function adapterFor(selection: SpeechSelection, providers: ModelProvider[]): TranscriptionAdapterId | null {
  return speechModelAdapter(selection) ?? (acceptsAudio(selection, providers) ? 'multimodal' : null);
}

function keyHint(provider: string, providers: ModelProvider[]): string | null {
  return credentialsError(provider, providers) === null ? null : `Add ${getProviderTitle(provider)} API key`;
}

function cloudOptions(providers: ModelProvider[]): SpeechModelOption[] {
  return Object.entries(providerModels).flatMap(([provider, models]) => {
    const hint = keyHint(provider, providers);
    return models.map((m) => ({ provider, model: m.id, label: m.label, ready: hint === null, hint, live: false }));
  });
}

/** Models on active providers that pass `include`, ready when the provider has a key (local servers get a default one). */
function providerOptions(
  providers: ModelProvider[],
  include: (provider: ModelProvider, model: Model) => boolean,
): SpeechModelOption[] {
  return providers
    .filter((p) => p.active)
    .flatMap((p) => {
      const hint = keyHint(p.provider, providers);
      return (p.models ?? [])
        .filter((m) => include(p, m))
        .map((m) => ({ provider: p.provider, model: m.id, label: m.name || m.id, ready: hint === null, hint, live: false }));
    });
}

const isLocalSpeechModel = (p: ModelProvider, m: Model) =>
  isLocalProviderId(p.provider) && localSpeechModelPattern.test(m.id);

/** Audio models join the picker only when the user ticks "Audio input" — the curated list stays short. */
const isTickedAudioModel = (_provider: ModelProvider, m: Model) => m.audioInput === true;

function hexOptions(status: HexStatus | undefined): SpeechModelOption[] {
  const installed = installedHexModels(status).filter((m) => !TRANSCRIPTION_CONFIG.hiddenHexModels.includes(m.id));
  if (installed.length > 0) {
    return installed.map((m) => ({ provider: hexProvider, model: m.id, label: m.name, ready: true, hint: null, live: false }));
  }
  const hint = status?.running ? 'Download a model in Hex' : 'Open Hex';
  return [{ provider: hexProvider, model: '', label: 'Hex', ready: false, hint, live: false }];
}

/**
 * Keyless speech sources: Kasset's own engine (always present once its model
 * list loads) and integrations, each present only while that integration is
 * on (its status may still be loading); absent → it offers nothing.
 */
export interface SpeechSources {
  onDevice?: { models: LocalModel[] };
  hex?: { status: HexStatus | undefined };
  appleSpeech?: { status: AppleSpeechStatus | undefined };
}

/** Kasset's engine: every curated model; one not downloaded yet shows its size. */
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
  return [{ provider, model, label, ready: isAppleSpeechReady(status), hint: appleSpeechHint(status), live: false }];
}

/**
 * Every speech model in picker order — what runs on this Mac first: Apple
 * Speech, Kasset's own models, Hex; then curated cloud models, local servers'
 * speech models, and models the user ticked "Audio input" for. The picker keeps
 * this order in both its ready groups and "Needs setup", so on-device choices
 * lead and key-gated ones trail. The first entry per selection wins (curated labels).
 */
export function speechModelOptions(providers: ModelProvider[], sources: SpeechSources): SpeechModelOption[] {
  const options = [
    ...(sources.appleSpeech ? appleSpeechOptions(sources.appleSpeech.status) : []),
    ...(sources.onDevice ? onDeviceOptions(sources.onDevice.models) : []),
    ...(sources.hex ? hexOptions(sources.hex.status) : []),
    ...cloudOptions(providers),
    ...providerOptions(providers, isLocalSpeechModel),
    ...providerOptions(providers, isTickedAudioModel),
  ];
  return uniqueBySelection(options);
}

/** One option per selection; the first listed wins. */
function uniqueBySelection(options: SpeechModelOption[]): SpeechModelOption[] {
  const byKey = new Map<string, SpeechModelOption>();
  for (const option of options) {
    const key = speechSelectionKey(option);
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
  return keyHint(selection.provider, providers) === null;
}

/** First-run choice: the first default whose provider has a key. */
export function defaultSpeechSelection(providers: ModelProvider[]): SpeechSelection | null {
  return TRANSCRIPTION_CONFIG.defaultOrder.find((d) => keyHint(d.provider, providers) === null) ?? null;
}

/** The saved selection, or null when none was chosen. */
export function speechSelectionOf(settings: { transcriptionProvider?: string; transcriptionModel?: string }): SpeechSelection | null {
  if (!settings.transcriptionProvider) return null;
  return { provider: settings.transcriptionProvider, model: settings.transcriptionModel ?? '' };
}

/** Stable string for a selection (Select values); `provider` ids never contain `::`. */
export const speechSelectionKey = (s: SpeechSelection): string => `${s.provider}::${s.model}`;

export function parseSpeechSelectionKey(key: string): SpeechSelection {
  const at = key.indexOf('::');
  return { provider: key.slice(0, at), model: key.slice(at + 2) };
}
