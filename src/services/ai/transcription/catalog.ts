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
import { installedHexModels } from './hex';
import { appleSpeechHint, isAppleSpeechReady } from './appleSpeech';
import type { AppleSpeechStatus } from '@services/ai/apple/appleIntelligence.service';
import type { TranscriptionAdapterId } from '@config/transcription.config';
import type { Model, ModelProvider } from '@shared/types/modelProviders';
import type { HexStatus } from './hex';
import type { SpeechSelection } from './types';

export interface SpeechModelOption extends SpeechSelection {
  label: string;
  ready: boolean;
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
    return models.map((m) => ({ provider, model: m.id, label: m.label, ready: hint === null, hint }));
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
        .map((m) => ({ provider: p.provider, model: m.id, label: m.name || m.id, ready: hint === null, hint }));
    });
}

const isLocalSpeechModel = (p: ModelProvider, m: Model) =>
  isLocalProviderId(p.provider) && localSpeechModelPattern.test(m.id);

const isAudioModel = (p: ModelProvider, m: Model) =>
  capabilitiesOf(p.provider, m).audioInput;

function hexOptions(status: HexStatus | undefined): SpeechModelOption[] {
  const installed = installedHexModels(status).filter((m) => !TRANSCRIPTION_CONFIG.hiddenHexModels.includes(m.id));
  if (installed.length > 0) {
    return installed.map((m) => ({ provider: hexProvider, model: m.id, label: m.name, ready: true, hint: null }));
  }
  const hint = status?.running ? 'Download a model in Hex' : 'Open Hex';
  return [{ provider: hexProvider, model: '', label: 'Hex', ready: false, hint }];
}

/**
 * Speech sources contributed by integrations. A key is present only while that
 * integration is on (its status may still be loading); absent → it offers nothing.
 */
export interface IntegrationSpeech {
  hex?: { status: HexStatus | undefined };
  appleSpeech?: { status: AppleSpeechStatus | undefined };
}

function appleSpeechOptions(status: AppleSpeechStatus | undefined): SpeechModelOption[] {
  const { provider, model, label } = TRANSCRIPTION_CONFIG.appleSpeech;
  return [{ provider, model, label, ready: isAppleSpeechReady(status), hint: appleSpeechHint(status) }];
}

/**
 * Every speech model in picker order: curated cloud models, local speech models,
 * any other audio-input model, then integrations that are on. The first entry
 * per selection wins (curated labels).
 */
export function speechModelOptions(providers: ModelProvider[], integrations: IntegrationSpeech): SpeechModelOption[] {
  const options = [
    ...cloudOptions(providers),
    ...providerOptions(providers, isLocalSpeechModel),
    ...providerOptions(providers, isAudioModel),
    ...(integrations.appleSpeech ? appleSpeechOptions(integrations.appleSpeech.status) : []),
    ...(integrations.hex ? hexOptions(integrations.hex.status) : []),
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
  integrations: IntegrationSpeech,
): boolean {
  if (!selection || !adapterFor(selection, providers)) return false;
  if (selection.provider === hexProvider) return !!integrations.hex && installedHexModels(integrations.hex.status).length > 0;
  if (selection.provider === TRANSCRIPTION_CONFIG.appleSpeech.provider) {
    return !!integrations.appleSpeech && isAppleSpeechReady(integrations.appleSpeech.status);
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
