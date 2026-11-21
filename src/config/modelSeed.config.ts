/** Models models.dev doesn't list, in its own shape so the one catalog lookup answers for them as for any other: speech
 *  providers' current models, from the providers' own model pages (developers.deepgram.com/docs/models-languages-overview,
 *  elevenlabs.io/docs/overview/models; checked 2026-11-21). models.dev wins whenever it lists a model. */

type SeedModality = 'text' | 'audio';

export interface SeedModel {
  id: string;
  modalities: { input: SeedModality[]; output: SeedModality[] };
}

const speechToText = (...ids: string[]): SeedModel[] => ids.map((id) => ({ id, modalities: { input: ['audio'], output: ['text'] } }));
const textToSpeech = (...ids: string[]): SeedModel[] => ids.map((id) => ({ id, modalities: { input: ['text'], output: ['audio'] } }));

const byId = (models: SeedModel[]): Record<string, SeedModel> => Object.fromEntries(models.map((m) => [m.id, m]));

export const MODEL_SEED: Readonly<Record<string, Record<string, SeedModel>>> = {
  deepgram: byId([
    ...speechToText(
      'flux-general-en', 'flux-general-multi',
      'nova-3', 'nova-3-general', 'nova-3-medical', 'nova-3-pharma',
      'nova-2', 'nova-2-general', 'nova-2-meeting', 'nova-2-phonecall', 'nova-2-finance', 'nova-2-conversationalai',
      'nova-2-voicemail', 'nova-2-video', 'nova-2-medical', 'nova-2-drivethru', 'nova-2-automotive', 'nova-2-atc',
    ),
  ]),
  elevenlabs: byId([
    ...speechToText('scribe_v3', 'scribe_v3_live', 'scribe_v2', 'scribe_v2_realtime', 'scribe_v2_medical'),
    ...textToSpeech('eleven_v4', 'eleven_v4_turbo', 'eleven_v3', 'eleven_v3_conversational', 'eleven_multilingual_v2', 'eleven_flash_v2_5', 'eleven_flash_v2'),
  ]),
};
