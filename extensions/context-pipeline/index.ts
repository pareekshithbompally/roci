import { ContextPipeline } from './pipeline';
import { MentionProvider } from './providers/mention.provider';

export const contextPipeline = new ContextPipeline()
  .register(new MentionProvider());

export type { ContextProvider, ContextInput, ContextOutput } from './types';
