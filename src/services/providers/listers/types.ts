/** The lister contract: one way of reading a model list, shared by every provider whose list has that format. */

import type { ListedModel } from '@services/ai/models/report';

/** Where and how to ask for the list. */
export interface ListConnection {
  /** The API base URL as saved (`https://api.openai.com/v1`, `http://127.0.0.1:11434/v1`). */
  baseUrl: string;
  apiKey?: string;
  headers?: Record<string, string>;
  /** Ends the request early (a probe gives up on a server that doesn't answer). */
  signal?: AbortSignal;
}

export interface ModelLister {
  /** Whether the server speaks this format; only formats a server can be recognised by have it. */
  recognises?(connection: ListConnection): Promise<boolean>;
  list(connection: ListConnection): Promise<ListedModel[]>;
}
