/**
 * Utility Functions Unit Tests
 * 
 * Tests for utility functions to ensure they work correctly during refactoring.
 */

import { describe, it, expect } from 'vitest';

describe('Audio Utilities', () => {
  it('should import audio utils', async () => {
    const audioUtils = await import('@/utils/audioUtils');
    expect(audioUtils).toBeDefined();
  });
});

describe('VTT Parser', () => {
  it('should import vtt parser', async () => {
    const vttParser = await import('@/utils/vttParser');
    expect(vttParser).toBeDefined();
  });
});

describe('Provider Utilities', () => {
  it('should import provider utils', async () => {
    const providerUtils = await import('@/utils/providerUtils');
    expect(providerUtils).toBeDefined();
    expect(typeof providerUtils.getProviderTitle).toBe('function');
  });
});
