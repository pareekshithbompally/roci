import { describe, it, expect } from 'vitest';
import { buildTranscriptionRequest } from '@core/ai';
import { fieldGuide } from '@core/ai/prompts/transcription.prompt';
import { transcriptionSchema } from '@core/ai/schemas/transcription.schema';

const temporalContext = 'Current date: 2026-11-18 (Wednesday).';

describe('transcriptionSchema', () => {
  it('limits categories to the user\'s list when there is one', () => {
    expect(transcriptionSchema(['Sales', 'Hiring']).properties.categories.items).toEqual({ type: 'string', enum: ['Sales', 'Hiring'] });
    expect(transcriptionSchema([]).properties.categories.items).toEqual({ type: 'string' });
  });
});

describe('fieldGuide', () => {
  it('lists nested object fields and the fields of array items', () => {
    const guide = fieldGuide(transcriptionSchema([]).properties).join('\n');
    expect(guide).toContain('- `summary`:');
    expect(guide).toContain('  - `overview`:');
    expect(guide).toContain('    - `dueDate`: When it is due, YYYY-MM-DD');
    expect(guide).toContain('    - `owner`:');
  });
});

describe('buildTranscriptionRequest', () => {
  it('pairs the prompt with the schema it describes', () => {
    const { prompt, outputSchema } = buildTranscriptionRequest({ categories: ['Sales'], temporalContext });
    expect(outputSchema.schema).toEqual(transcriptionSchema(['Sales']));
    expect(prompt).toContain('Categories to choose from: Sales.');
    expect(prompt).toContain('`actionItems`');
    expect(prompt).toContain(temporalContext);
  });

  it('adds calendar details, and owner guidance only with participants', () => {
    const titleOnly = buildTranscriptionRequest({ categories: [], temporalContext, meetingContext: { title: 'Sync', participants: [] } });
    expect(titleOnly.prompt).toContain('- Title: Sync');
    expect(titleOnly.prompt).not.toContain('action-item owners');
    const withPeople = buildTranscriptionRequest({
      categories: [],
      temporalContext,
      meetingContext: { title: 'Sync', participants: [{ name: 'Priya', email: 'p@example.com' }] },
    });
    expect(withPeople.prompt).toContain('- Participants: Priya (p@example.com)');
    expect(withPeople.prompt).toContain('action-item owners');
  });

  it('lists the user\'s own notes only when there are some', () => {
    expect(buildTranscriptionRequest({ categories: [], temporalContext }).prompt).not.toContain("The user's notes");
    const { prompt } = buildTranscriptionRequest({
      categories: [],
      temporalContext,
      userNotes: [{ text: 'launch date?', createdAt: '2026-11-18T10:00:00Z' }, { text: 'ask Raj re: API', createdAt: '2026-11-18T10:05:00Z' }],
    });
    expect(prompt).toContain("## The user's notes (typed during the meeting)");
    expect(prompt).toMatch(/- \(.+\) launch date\?\n- \(.+\) ask Raj re: API/);
  });

  it('asks for each note filled in only when the user typed notes', () => {
    const plain = buildTranscriptionRequest({ categories: [], temporalContext });
    const summaryOf = (schema: unknown) => (schema as { properties: { summary: { properties: object; required: string[] } } }).properties.summary;
    expect(summaryOf(plain.outputSchema.schema).properties).not.toHaveProperty('enhancedNotes');
    const withNotes = buildTranscriptionRequest({ categories: [], temporalContext, userNotes: [{ text: 'launch?', createdAt: '2026-11-18T10:00:00Z' }] });
    expect(summaryOf(withNotes.outputSchema.schema).required).toContain('enhancedNotes');
    expect(withNotes.prompt).toContain('`enhancedNotes`');
  });
});
