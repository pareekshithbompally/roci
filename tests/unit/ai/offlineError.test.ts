/** A failure while the device is offline reads as that, through the one AI error path; the device's own report decides. */

import { afterEach, describe, expect, it } from 'vitest';
import { APICallError } from 'ai';
import { offlineError, toAiError } from '@services/ai/errors';
import { setNetworkOnline } from '@shared/stores/networkStore';
import { NETWORK_COPY } from '@config/network.config';

const sendFailed = new Error('error sending request for url (https://api.openai.com/v1/responses)');
const refused = new APICallError({ message: 'Invalid API key', url: 'https://api.openai.com', requestBodyValues: {}, statusCode: 401 });
const stopped = Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' });

afterEach(() => setNetworkOnline(true));

describe('offline errors', () => {
  it('online, a failure keeps its own words', () => {
    expect(offlineError(sendFailed)).toBeNull();
  });

  it('offline, a failed request says the device is offline, for chat and every other job', () => {
    setNetworkOnline(false);
    expect(offlineError(sendFailed)?.message).toBe(NETWORK_COPY.offline);
    const summary = toAiError(sendFailed, 'summary', 'openai');
    expect([summary.kind, summary.message]).toEqual(['network', NETWORK_COPY.offline]);
  });

  it('offline, a provider\'s own answer and a Stop are not relabelled', () => {
    setNetworkOnline(false);
    expect(offlineError(refused)).toBeNull();
    expect(toAiError(refused, 'summary', 'openai').kind).toBe('auth');
    expect(toAiError(stopped, 'summary', 'openai').kind).toBe('cancelled');
  });
});
