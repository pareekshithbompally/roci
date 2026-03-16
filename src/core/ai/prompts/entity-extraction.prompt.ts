/**
 * Entity Extraction Prompt
 *
 * Instructs the LLM to extract structured entities and relationships
 * from a meeting's content. Designed for structured output (JSON schema).
 */

export function buildEntityExtractionPrompt(meetingTitle: string, categories: string[] = []): string {
  const categorySection = categories.length > 0
    ? `Categories: ${categories.join(', ')}

`
    : '';

  return `You are an entity extraction system. Extract all meaningful entities and their relationships from this meeting.

Meeting: "${meetingTitle}"

${categorySection}## Instructions

1. **Identify entities**: Extract all people, topics discussed, decisions made, action items assigned, and projects referenced.
   - Use full names for people (e.g., "Alice Chen" not "Alice")
   - Use concise noun phrases for topics and projects (e.g., "database migration" not "the ongoing database migration project")
   - Include the meeting itself as an entity of type "meeting"
   ${categories.length > 0 ? `- Consider the provided categories when identifying relevant topics and context\n` : ''}

2. **Identify relationships**: For each pair of related entities, specify the relationship type:
   - person → attended → meeting (who was in this meeting)
   - meeting → discussed → topic (what was talked about)
   - meeting → produced_decision → decision (what was decided)
   - meeting → produced_action → action_item (what was assigned)
   - action_item → assigned_to → person (who owns it)
   - decision → affects → project (what project is impacted)
   - person → works_on → project (who works on what)
   - topic → related_to → topic (how topics connect)
   - person → mentioned_by → person (who referenced whom)
   ${categories.length > 0 ? `- meeting → belongs_to_category → category (link to each provided category)\n` : ''}

3. **Be precise**: Only extract entities and relationships that are clearly stated or strongly implied. Do not infer relationships that aren't supported by the content.

4. **Normalize names**: Use consistent naming. If someone is called "Bob" and "Robert Smith", use "Robert Smith" everywhere.`;
}
