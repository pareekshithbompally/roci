/**
 * Document Processing Prompt
 * Prompt template for document (VTT, text, etc.) processing
 */

export interface DocumentPromptOptions {
  categories?: string[];
  fileName?: string;
  speakers?: string[];
  isVTT?: boolean;
  /** Formatted temporal context string from formatTemporalContext(). */
  temporalContext?: string;
}

export const buildVTTDocumentPrompt = (
  transcriptText: string,
  options: DocumentPromptOptions = {}
): string => {
  const { categories = [], speakers = [], temporalContext } = options;
  
  const speakerInfo = speakers.length > 0 
    ? `\n\nDetected speakers: ${speakers.join(', ')}`
    : '';
  
  const contextText = `This is a VTT transcript file with timestamps and speakers.${speakerInfo}\n\nTranscript:\n${transcriptText}`;

  const temporalBlock = temporalContext ? `\n${temporalContext}\n` : '';
  
  return `You are a professional meeting analyst. Analyze this transcript and provide a comprehensive summary.
${temporalBlock}
IMPORTANT: Generate REAL content based on the actual transcript content. Do NOT use placeholder or generic text.

Transcript:
${contextText}

1. Title: Create a concise, descriptive title (max 6 words) that captures the main topic.

2. Summary Structure - Use this EXACT format:

## Meeting Overview
[2-3 sentence executive summary]

## Key Discussion Points
- [Topic 1 with details]
- [Topic 2 with details]

## Decisions Made
- [Decisions or "No formal decisions were recorded"]

## Action Items
- [Task] - Owner: [Person] - Due: [Date if mentioned]

## Next Steps
- [Follow-up items]

3. Categories: From [${categories.join(', ')}]. Use ONLY these exact names.

4. Transcript: Return the COMPLETE timestamped transcript preserving all speakers.

CRITICAL: You MUST use these EXACT delimiters in your response:
---TITLE---
---SUMMARY---
---CATEGORIES---
---TRANSCRIPT---

Output format (COPY THIS STRUCTURE EXACTLY):
---TITLE---
[Your title here]
---SUMMARY---
[Your complete summary with all sections above]
---CATEGORIES---
[Category1, Category2]
---TRANSCRIPT---
[Complete transcript with timestamps and speakers]

DO NOT add any text before ---TITLE--- or after the transcript ends.
DO NOT modify the delimiter format.
START your response with ---TITLE--- immediately.`;
};

export const buildGenericDocumentPrompt = (categories: string[] = [], temporalContext?: string): string => {
  const temporalBlock = temporalContext ? `\n${temporalContext}\n` : '';
  return `Analyze this document:${temporalBlock}
1. Title: Concise.
2. Summary: Detailed Markdown.
3. Categories: From [${categories.join(', ')}].
4. Transcript: Full text.

Output format:
---TITLE---
---SUMMARY---
---CATEGORIES---
---TRANSCRIPT---`;
};

export const DOCUMENT_PROMPT = {
  buildVTT: buildVTTDocumentPrompt,
  buildGeneric: buildGenericDocumentPrompt,
};
