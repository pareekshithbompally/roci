/** The one request every lister makes: GET a JSON list, failing with the status when the server refuses. */

import { getPlatformFetch } from '@services/platform-fetch';
import type { ListConnection } from './types';

/** The server answered with an error status (401 bad key, 404 no such endpoint). */
export class ListRequestError extends Error {
  constructor(readonly status: number, readonly statusText: string) {
    super(`${status} ${statusText}`);
    this.name = 'ListRequestError';
  }
}

export async function getJson(url: string, { headers, signal }: Pick<ListConnection, 'headers' | 'signal'>): Promise<unknown> {
  const response = await getPlatformFetch()(url, { headers, signal });
  if (!response.ok) throw new ListRequestError(response.status, response.statusText);
  return response.json();
}

/** True when the server answers the path at all (a format's own endpoint); a refusal or no answer is false. */
export async function answers(url: string, connection: Pick<ListConnection, 'headers' | 'signal'>): Promise<boolean> {
  try {
    await getJson(url, connection);
    return true;
  } catch {
    return false;
  }
}

/** The server root: the API base URL without its `/v1`. */
export const rootOf = (baseUrl: string): string => baseUrl.replace(/\/v1\/?$/, '').replace(/\/$/, '');

/** The base URL without a trailing slash. */
export const trimmed = (baseUrl: string): string => baseUrl.replace(/\/$/, '');

export const asArray = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);
export const field = (data: unknown, key: string): unknown => (data && typeof data === 'object' ? (data as Record<string, unknown>)[key] : undefined);
