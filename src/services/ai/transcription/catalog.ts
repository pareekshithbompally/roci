/**
 * Speech model catalog — what the user can pick, whether it can run now, and
 * which adapter and credentials run it. Single rule used by Settings › Audio,
 * the composer's mic, the menubar, and the pipeline.
 */

import { TRANSCRIPTION_CONFIG } from '@config/transcription.config';
import { getDefaultBaseUrl } from '@shared/utils/modelResolver';
import { getProviderTitle, isLocalProviderId } from '@shared/utils/provider.utils';
import { resolveCred } from './cred';
import { installedHexModels } from './hex';
import { appleSpeechHint, isAppleSpeechReady } from './appleSpeech';
import type { AppleSpeechStatus } from '@services/ai/apple/appleIntelligence.service';
import type { TranscriptionAdapterId } from '@config/transcription.config';
import type { ModelProvider } from '@shared/types/modelProviders';
import type { Cred } from './cred';
import type { HexStatus } from './hex';
import type { SpeechSelection } from './types';

export interface SpeechModelOption extends SpeechSelection {
  label: string;
  ready: boolean;
  /** Short next step when not ready ("Add OpenAI API key", "Open Hex"). */
  hint: string | null;
}

const { hexProvider } = TRANSCRIPTION_CONFIG;

export function adapterFor(provider: string): TranscriptionAdapterId | null {
  if (isLocalProviderId(provider)) return 'openai-compatible';
  return TRANSCRIPTION_CONFIG.adapterByProvider[provider] ?? null;
}

/** The provider's key and base URL (managed providers fall back to their default URL). */
export function speechCred(provider: string, providers: ModelProvider[]): Cred {
  const cred = resolveCred(provider, providers);
  return { ...cred, baseUrl: cred.baseUrl || getDefaultBaseUrl(provider) || undefined };
}

function keyHint(provider: string, providers: ModelProvider[]): string | null {
  try {
    resolveCred(provider, providers);
    return null;
  } catch {
    return `Add ${getProviderTitle(provider)} API key`;
  }
}

function cloudOptions(providers: ModelProvider[]): SpeechModelOption[] {
  return Object.entries(TRANSCRIPTION_CONFIG.providerModels).flatMap(([provider, models]) => {
    const hint = keyHint(provider, providers);
    return models.map((m) => ({ provider, model: m.id, label: m.label, ready: hint === null, hint }));
  });
}

function localOptions(providers: ModelProvider[]): SpeechModelOption[] {
  return providers
    .filter((p) => p.active && isLocalProviderId(p.provider))
    .flatMap((p) => (p.models ?? [])
      .filter((m) => TRANSCRIPTION_CONFIG.localSpeechModelPattern.test(m.id))
      .map((m) => ({ provider: p.provider, model: m.id, label: m.name || m.id, ready: true, hint: null })));
}

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

/** Every speech model in picker order: cloud providers, local servers, then integrations that are on. */
export function speechModelOptions(providers: ModelProvider[], integrations: IntegrationSpeech): SpeechModelOption[] {
  return [
    ...cloudOptions(providers),
    ...localOptions(providers),
    ...(integrations.appleSpeech ? appleSpeechOptions(integrations.appleSpeech.status) : []),
    ...(integrations.hex ? hexOptions(integrations.hex.status) : []),
  ];
}

/** Whether the selection can transcribe right now. */
export function isSpeechSelectionReady(
  selection: SpeechSelection | null,
  providers: ModelProvider[],
  integrations: IntegrationSpeech,
): boolean {
  if (!selection || !adapterFor(selection.provider)) return false;
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
