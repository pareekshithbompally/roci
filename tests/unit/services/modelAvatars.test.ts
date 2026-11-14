import { describe, it, expect } from 'vitest';
import { modelOrg, getAvatarUrl } from '@services/modelAvatars';

describe('modelOrg', () => {
  it('parses org from repo-style ids, ~ ids and hf.co-prefixed Ollama ids', () => {
    expect(modelOrg('qwen/qwen3-8b')).toBe('qwen');
    expect(modelOrg('~openai/gpt-oss-20b')).toBe('openai');
    expect(modelOrg('hf.co/unsloth/Qwen3-8B-GGUF:Q4_K_M')).toBe('unsloth');
  });

  it('returns null for ids without an org', () => {
    expect(modelOrg('llama3.2')).toBeNull();
    expect(modelOrg('qwen3:8b')).toBeNull();
  });
});

describe('getAvatarUrl', () => {
  it('builds the HF avatars URL without the ~ prefix', () => {
    expect(getAvatarUrl('~qwen')).toBe('https://huggingface.co/api/avatars/qwen');
  });
});
