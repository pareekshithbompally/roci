import { describe, expect, it } from 'vitest';
import { buildChatSystemPrompt, buildTranscriptionPrompt, liveNotesPrompt, NO_PERSONALIZATION, NO_TOOLS, termsWithin, verbatimTranscribePrompt } from '@core/ai';
import { fileHints, liveHints } from '@services/ai/transcription/vocabularyHints';
import { TRANSCRIPTION_CONFIG } from '@config/transcription.config';

const TERMS = ['Context7', 'Priya Raman'];

describe('terminology in prompts', () => {
  it('keeps the first terms that fit, counting characters', () => {
    expect(termsWithin(['Kaffar', 'Rodolfo', 'Bragelonne'], 20)).toEqual(['Kaffar', 'Rodolfo']);
    expect(termsWithin(['😀😀', 'ab'], 6)).toEqual(['😀😀', 'ab']);
    expect(termsWithin(['toolong'], 3)).toEqual([]);
  });

  it('states the terms in the chat, summary, live-notes and verbatim prompts, and nothing without terms', () => {
    const chat = (terms?: string[]) => buildChatSystemPrompt({ tools: NO_TOOLS, modalities: { input: ['text'], output: ['text'] }, meetingCount: 0, timeContext: '', personalization: terms && { terms } });
    const summary = (terms?: string[]) => buildTranscriptionPrompt({ categories: [], temporalContext: '', schema: {}, personalization: terms && { terms } });
    for (const prompt of [chat(TERMS), summary(TERMS), liveNotesPrompt({ terms: TERMS }), verbatimTranscribePrompt(TERMS)]) {
      expect(prompt).toContain('Context7, Priya Raman');
    }
    for (const prompt of [chat(), summary(), liveNotesPrompt(NO_PERSONALIZATION), verbatimTranscribePrompt([])]) {
      expect(prompt).not.toContain('terminology');
      expect(prompt).not.toContain('names and terms');
    }
  });
});

describe('speech hints through the AI SDK', () => {
  it('gives OpenAI-compatible files a context prompt within its budget', () => {
    expect(fileHints('openai-compatible', TERMS)).toEqual({ providerOptions: { openai: { prompt: 'Context7, Priya Raman' } }, prompt: 'Context7, Priya Raman' });
    const many = Array.from({ length: 200 }, (_, i) => `Term ${i}`);
    const prompt = fileHints('openai-compatible', many).prompt ?? '';
    expect(prompt.length).toBeLessThanOrEqual(TRANSCRIPTION_CONFIG.vocabularyHints.promptChars);
  });

  it('gives ElevenLabs streams key terms within its limits', () => {
    const { max, maxChars } = TRANSCRIPTION_CONFIG.vocabularyHints.keyterms;
    const terms = ['short', 'x'.repeat(maxChars + 1), ...Array.from({ length: max + 5 }, (_, i) => `t${i}`)];
    const keyterms = (liveHints('elevenlabs', terms) as { elevenlabs: { streaming: { keyterms: string[] } } }).elevenlabs.streaming.keyterms;
    expect(keyterms).toHaveLength(max);
    expect(keyterms[0]).toBe('short');
    expect(keyterms.every((term) => term.length <= maxChars)).toBe(true);
  });

  it('sends nothing when there are no terms or the family takes none', () => {
    expect(fileHints('openai-compatible', [])).toEqual({ providerOptions: undefined });
    expect(fileHints('deepgram', TERMS)).toEqual({ providerOptions: undefined });
    expect(fileHints('elevenlabs', TERMS)).toEqual({ providerOptions: undefined });
    expect(liveHints('openai-compatible', TERMS)).toBeUndefined();
  });
});

describe('prompts personalization', () => {
  const chat = (personalization: Parameters<typeof buildChatSystemPrompt>[0]['personalization']) =>
    buildChatSystemPrompt({ tools: NO_TOOLS, modalities: { input: ['text'], output: ['text'] }, meetingCount: 0, timeContext: '', personalization });

  it('keeps the default answer style, writes the knobs, and uses a rewrite in their place', () => {
    expect(chat(NO_PERSONALIZATION)).toContain('- Lead with the answer; keep it short; use a list or table only when it reads better.');
    const detailed = chat({ terms: [], responses: { length: 'detailed', tone: 'formal' } });
    expect(detailed).toContain('explain it fully');
    expect(detailed).toContain('formal, professional tone');
    const rewritten = chat({ terms: [], responses: { length: 'detailed' }, templates: { chatStyle: '- Answer in haiku.' } });
    expect(rewritten).toContain('- Answer in haiku.');
    expect(rewritten).not.toContain('explain it fully');
    expect(rewritten).toContain('Never invent facts');
  });

  it('gives chat the profile and custom instructions, and transcript tasks only the profile', () => {
    const personalization = { terms: [], profile: { name: 'Pat' }, customInstructions: 'Use metric units.' };
    expect(chat(personalization)).toContain('- Name: Pat.');
    expect(chat(personalization)).toContain('Use metric units.');
    const summary = buildTranscriptionPrompt({ categories: [], temporalContext: '', schema: {}, personalization });
    expect(summary).toContain('- Name: Pat.');
    expect(summary).not.toContain('Use metric units.');
  });
});
