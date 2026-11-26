import { describe, expect, it } from 'vitest';
import {
  contextChoices,
  optionValue,
  ownTuning,
  presetChoice,
  resolveTuning,
  serverPresets,
  withKvType,
  withPreset,
  withoutKeys,
} from '@shared/utils/modelTuning';

describe('model tuning', () => {
  it('resolves the user’s values over the maker’s over Roci’s, by llama-server’s names', () => {
    expect(resolveTuning('gemma-4-e2b', { temp: 0.4 })).toEqual({
      'ctx-size': 16384, 'n-predict': 8192, 'reasoning-budget': 1024,
      temp: 0.4, 'top-p': 0.95, 'top-k': 64, 'min-p': 0, 'presence-penalty': 0, 'repeat-penalty': 1,
    });
    expect(resolveTuning('unknown-model', {})).toEqual({ 'ctx-size': 16384, 'n-predict': 8192, 'reasoning-budget': 1024 });
  });

  it('ignores a tuning saved in another shape', () => {
    expect(ownTuning({ temperature: 2, kvBits: 8, temp: 0.5, 'top-k': undefined })).toEqual({ temp: 0.5 });
    expect(resolveTuning('unknown-model', { temperature: 2 } as never)).not.toHaveProperty('temperature');
  });

  it('gives the server every downloaded chat model’s resolved preset', () => {
    const presets = serverPresets(['gemma-4-e2b', 'lfm3-omni-2b'], { 'gemma-4-e2b': { 'ctx-size': 32768, 'cache-type-k': 'q8_0', 'cache-type-v': 'q8_0' } });
    expect(presets['gemma-4-e2b']).toMatchObject({ 'ctx-size': 32768, 'cache-type-k': 'q8_0', temp: 1 });
    expect(presets['lfm3-omni-2b']).toMatchObject({ 'ctx-size': 16384, temp: 0.3, 'min-p': 0.15, 'dry-multiplier': 0.8 });
  });

  it('reads an unset sampling option as llama.cpp’s own', () => {
    expect(optionValue({}, 'temp')).toBe(0.8);
    expect(optionValue({ temp: 0.1 }, 'temp')).toBe(0.1);
  });

  it('matches presets by what the model runs, the empty choice while the user set none of its keys', () => {
    const gemma = (saved: object) => resolveTuning('gemma-4-e2b', saved);
    expect(presetChoice('style', {}, gemma({}))).toBe('balanced');
    expect(presetChoice('style', { temp: 0.2, 'top-p': 0.9 }, gemma({ temp: 0.2, 'top-p': 0.9 }))).toBe('precise');
    expect(presetChoice('style', { temp: 0.3 }, gemma({ temp: 0.3 }))).toBeUndefined();
    expect(presetChoice('repeats', {}, gemma({}))).toBe('off');
    expect(presetChoice('repeats', {}, resolveTuning('lfm3-omni-2b', {}))).toBe('light');
  });

  it('sets a preset’s keys and keeps the rest', () => {
    expect(withPreset('style', 'creative', { temp: 0.3, 'ctx-size': 32768 })).toEqual({ 'ctx-size': 32768, temp: 1, 'top-p': 1 });
    expect(withPreset('style', 'balanced', { temp: 0.3, 'top-p': 0.5, 'top-k': 10 })).toEqual({ 'top-k': 10 });
  });

  it('sets both halves of the KV cache, and clears them for llama.cpp’s own type', () => {
    expect(withKvType({ temp: 1 }, 'q4_0')).toEqual({ temp: 1, 'cache-type-k': 'q4_0', 'cache-type-v': 'q4_0' });
    expect(withKvType({ 'cache-type-k': 'q8_0', 'cache-type-v': 'q8_0' }, 'f16')).toEqual({});
    expect(withoutKeys({ 'spec-type': 'none', temp: 1 }, ['spec-type'])).toEqual({ temp: 1 });
  });

  it('offers context sizes from what Roci’s chat needs up to the model’s own', () => {
    expect(contextChoices(131_072)).toEqual([8192, 16384, 32768, 65536, 131072]);
    expect(contextChoices(40_000)).toEqual([8192, 16384, 32768]);
    expect(contextChoices(null)).toEqual([8192]);
  });
});
