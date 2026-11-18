/** Model spine: the one answer to what a model is, which jobs it fits, and how it runs. */

export { describeModel, infoOf } from './facts';
export type { ModelDescription } from './facts';
export { fitsJob, jobChoices, jobRecords, modelRecords, modelsFor, modelSourceOf } from './records';
export type { ModelRecord, ModelSource } from './records';
export { transcribeAdapter } from './routes';
