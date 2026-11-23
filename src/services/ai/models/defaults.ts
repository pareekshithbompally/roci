/** The default models a connected provider offers, and what accepting them saves: one answer for the list shown and the
 *  settings written. */

import { PROVIDER_DEFAULTS, type ProviderDefaultModels } from '@config/providerDefaults.config';
import { APPLE_INTELLIGENCE } from '@config/providers.config';
import { READ_ALOUD_CONFIG } from '@config/readAloud.config';
import { TRANSCRIPTION_CONFIG } from '@config/transcription.config';
import { isLocalProviderId } from '@shared/utils/provider.utils';
import type { AppSettings } from '@shared/types';
import type { Model } from '@shared/types/modelProviders';
import { modelKey } from './keys';
import type { ModelRef } from './keys';
import { profileOf } from './profile';
import { fitsJob } from './records';
import { isEmptyReport } from './report';
import type { ListedModel } from './report';
import { isSpeechOnly } from './routes';

/** One model per job. Null: no chat or speech model; the system voices; no images. Summaries run on the chat model. */
export interface SetupDefaults {
  chat: ModelRef | null;
  transcription: ModelRef | null;
  readAloud: ModelRef | null;
  images: ModelRef | null;
}

const { appleSpeech } = TRANSCRIPTION_CONFIG;
const APPLE_SPEECH: ModelRef = { provider: appleSpeech.provider, model: appleSpeech.model };

export const isAppleSpeech = (ref: ModelRef | null): boolean => ref?.provider === APPLE_SPEECH.provider && ref.model === APPLE_SPEECH.model;

/** A server's own models, by what each can do: its first chat model and its first speech-to-text model. */
function serverModels(provider: string, listed: ListedModel[]): Partial<ProviderDefaultModels> {
  const records = listed.map(({ id, report }) => ({ id, provider, ...profileOf(provider, { id, reported: report }) }));
  return {
    chat: records.find((r) => fitsJob(r, 'chat'))?.id,
    transcription: records.find(isSpeechOnly)?.id,
  };
}

/** The defaults `provider` offers now: only models it lists; Apple Speech stands in where the device has it. */
export function defaultsFor(provider: string, listed: ListedModel[], hasAppleSpeech: boolean): SetupDefaults {
  const models = isLocalProviderId(provider) ? serverModels(provider, listed) : PROVIDER_DEFAULTS[provider] ?? {};
  const ids = new Set(listed.map((m) => m.id));
  const pick = (id: string | undefined): ModelRef | null => (id && ids.has(id) ? { provider, model: id } : null);
  return {
    chat: pick(models.chat),
    transcription: pick(models.transcription) ?? (hasAppleSpeech ? APPLE_SPEECH : null),
    readAloud: pick(models.readAloud),
    images: pick(models.images),
  };
}

/** Speech recognition on `ref`; Apple Speech comes with the integration that offers it. */
export const speechSettings = (ref: ModelRef | null): Partial<AppSettings> => ({
  transcriptionProvider: ref?.provider,
  transcriptionModel: ref?.model ?? '',
  ...(isAppleSpeech(ref) && { appleIntelligenceIntegration: { enabled: true } }),
});

/** What accepting the defaults saves. Apple Speech is left to `speechSettings`, once it can run. */
export function settingsOfDefaults(defaults: SetupDefaults): Partial<AppSettings> {
  const chat = defaults.chat ? modelKey(defaults.chat) : '';
  return {
    chatModel: chat,
    analyzeModel: chat,
    readAloudEngine: defaults.readAloud ? modelKey(defaults.readAloud) : READ_ALOUD_CONFIG.system.id,
    readAloudVoice: undefined,
    imageProvider: defaults.images?.provider,
    imageModel: defaults.images?.model,
    ...(!isAppleSpeech(defaults.transcription) && speechSettings(defaults.transcription)),
    ...(defaults.chat?.provider === APPLE_INTELLIGENCE.provider && { appleIntelligenceIntegration: { enabled: true } }),
  };
}

/** The provider's saved models with the defaults added. A chat model that also transcribes gets its Audio input ticked,
 *  which is what lists it under Speech recognition. */
export function withDefaultModels(saved: Model[], defaults: SetupDefaults, provider: string, listed: ListedModel[]): Model[] {
  const refs = Object.values(defaults).filter((ref): ref is ModelRef => ref?.provider === provider);
  const ids = [...new Set(refs.map((ref) => ref.model))];
  const added = ids.filter((id) => !saved.some((m) => m.id === id)).map((id): Model => {
    const report = listed.find((m) => m.id === id)?.report;
    return { id, name: id, ...(report && !isEmptyReport(report) && { reported: report }) };
  });
  const speech = defaults.transcription?.provider === provider ? defaults.transcription.model : undefined;
  return [...saved, ...added].map((m) =>
    m.id === speech && !isSpeechOnly({ provider, ...profileOf(provider, m) }) ? { ...m, overrides: { ...m.overrides, audio: true } } : m);
}
