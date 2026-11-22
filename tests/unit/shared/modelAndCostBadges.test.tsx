/** The model and cost badges every user-facing view shares, and the one rule a session's cost is summed by. */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { CostBadge } from '@shared/components/CostBadge';
import { modelCreditOf } from '@shared/components/ModelBadge';
import { sessionCostOf, type SessionUsage } from '@extensions/usage';

const row = (estimated_cost: number | null): SessionUsage => ({
  category: 'transcription', provider: 'openai', model: 'whisper-1', input_tokens: 0, output_tokens: 0, estimated_cost, audio_seconds: 24, timestamp: 1,
});

describe('sessionCostOf', () => {
  it('sums the priced calls and counts the unpriced ones', () => {
    const cost = sessionCostOf([row(0.001), row(0.0002), row(null)]);
    expect(cost?.total).toBeCloseTo(0.0012);
    expect(cost?.unpriced).toBe(1);
  });
  it('is null with nothing logged', () => {
    expect(sessionCostOf([])).toBeNull();
  });
});

describe('CostBadge', () => {
  it('shows a cloud cost to two significant digits', () => {
    expect(render(<CostBadge cost={{ total: 0.0012, unpriced: 0 }} />).container.textContent).toBe('$0.0012');
  });
  it('shows nothing when free (local), partly unpriced, or not logged', () => {
    expect(render(<CostBadge cost={{ total: 0, unpriced: 0 }} />).container.textContent).toBe('');
    expect(render(<CostBadge cost={{ total: 0.01, unpriced: 1 }} />).container.textContent).toBe('');
    expect(render(<CostBadge cost={null} />).container.textContent).toBe('');
  });
});

describe('modelCreditOf', () => {
  it('reads a model key as provider and model', () => {
    expect(modelCreditOf('openai::gpt-4o-mini-transcribe')).toEqual({ provider: 'openai', model: 'gpt-4o-mini-transcribe' });
  });
  it('nothing stored is no credit', () => {
    expect(modelCreditOf(undefined)).toBeNull();
  });
});
