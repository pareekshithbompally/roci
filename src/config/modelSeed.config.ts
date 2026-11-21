/** Models models.dev doesn't list, in its own shape so the one catalog lookup answers for them as for any other: what they
 *  take in and give out, and their price. Speech providers' current models from their own model pages
 *  (developers.deepgram.com/docs/models-languages-overview, elevenlabs.io/docs/overview/models) and published pay-as-you-go
 *  rates, checked 2026-11-21; a model with no published rate stays unpriced. models.dev wins whenever it lists a model; new
 *  providers' models are added here with an app update. */

type SeedModality = 'text' | 'audio';

export interface SeedModel {
  id: string;
  modalities: { input: SeedModality[]; output: SeedModality[] };
  /** As models.dev prices (USD per 1M tokens), plus `per_minute` (USD per minute of audio), which models.dev has no field for. */
  cost?: { input?: number; output?: number; per_minute?: number };
}

const MINUTES_PER_HOUR = 60;

const speechToText = (...ids: string[]): SeedModel[] => ids.map((id) => ({ id, modalities: { input: ['audio'], output: ['text'] } }));
const textToSpeech = (...ids: string[]): SeedModel[] => ids.map((id) => ({ id, modalities: { input: ['text'], output: ['audio'] } }));
/** USD per minute of audio, by model; models absent stay unpriced. */
const perMinute = (models: SeedModel[], prices: Record<string, number>): SeedModel[] =>
  models.map((m) => (prices[m.id] === undefined ? m : { ...m, cost: { per_minute: prices[m.id] } }));

const byId = (models: SeedModel[]): Record<string, SeedModel> => Object.fromEntries(models.map((m) => [m.id, m]));

export const MODEL_SEED: Readonly<Record<string, Record<string, SeedModel>>> = {
  deepgram: byId(perMinute([
    ...speechToText(
      'flux-general-en', 'flux-general-multi',
      'nova-3', 'nova-3-general', 'nova-3-medical', 'nova-3-pharma',
      'nova-2', 'nova-2-general', 'nova-2-meeting', 'nova-2-phonecall', 'nova-2-finance', 'nova-2-conversationalai',
      'nova-2-voicemail', 'nova-2-video', 'nova-2-medical', 'nova-2-drivethru', 'nova-2-automotive', 'nova-2-atc',
    ),
  ], {
    // pre-recorded rates; Deepgram bills a live stream higher
    'nova-3': 0.0043, 'nova-3-general': 0.0043, 'flux-general-en': 0.0065, 'flux-general-multi': 0.0078,
  })),
  elevenlabs: byId(perMinute([
    ...speechToText('scribe_v3', 'scribe_v3_live', 'scribe_v2', 'scribe_v2_realtime', 'scribe_v2_medical'),
    // voices are billed by the character, which no price field holds: unpriced
    ...textToSpeech('eleven_v4', 'eleven_v4_turbo', 'eleven_v3', 'eleven_v3_conversational', 'eleven_multilingual_v2', 'eleven_flash_v2_5', 'eleven_flash_v2'),
  ], {
    scribe_v3: 0.20 / MINUTES_PER_HOUR, scribe_v3_live: 0.22 / MINUTES_PER_HOUR, scribe_v2: 0.22 / MINUTES_PER_HOUR, scribe_v2_medical: 0.22 / MINUTES_PER_HOUR, scribe_v2_realtime: 0.39 / MINUTES_PER_HOUR,
  })),
};
