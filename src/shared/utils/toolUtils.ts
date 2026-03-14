/** Convert internal tool names to human-readable past-tense labels */
export function friendlyToolName(toolName: string): string {
  switch (toolName) {
    case 'search_meetings':   return 'Searched meetings';
    case 'get_meeting':       return 'Retrieved meeting';
    case 'list_meetings':     return 'Listed meetings';
    case 'get_action_items':  return 'Found action items';
    default: return toolName.replace(/_/g, ' ');
  }
}
