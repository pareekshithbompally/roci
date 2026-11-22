/** Model spine: the one answer to what a model is, which jobs it fits, and how it runs. */

export { FEATURES, featuresOf, isGuess, profileOf, shownProfile } from './profile';
export type { Fact, FactSource, ModelFeature, ModelProfile } from './profile';
export { isEmptyReport, mergeReports, toModalities, withReports } from './report';
export type { ListedModel } from './report';
export { fitsJob, jobChoices, jobRecords, modelRecords, modelsFor, modelSourceOf } from './records';
export type { ModelRecord, ModelSource } from './records';
export { isSpeechOnly, transcribeAdapter } from './routes';
export { modelKey, parseModelKey } from './keys';
export type { ModelRef } from './keys';
