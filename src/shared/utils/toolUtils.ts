/** Labels for tool activity — one function for all states */
export function toolLabel(toolName: string, status: 'calling' | 'complete' | 'error'): string {
  if (status === 'error') return `${formatToolName(toolName)} failed`;

  const labels: Record<string, [string, string]> = {
    // Custom meeting tools
    search_meetings:  ['Searching meetings…', 'Searched meetings'],
    get_meeting:      ['Retrieving meeting…', 'Retrieved meeting'],
    list_meetings:    ['Listing meetings…', 'Listed meetings'],
    get_action_items: ['Getting action items…', 'Found action items'],
    query_graph:      ['Querying knowledge graph…', 'Queried knowledge graph'],
    // Native provider tools (web search)
    webSearch:        ['Searching the web…', 'Searched the web'],
    googleSearch:     ['Searching the web…', 'Searched the web'],
    webSearchPreview: ['Searching the web…', 'Searched the web'],
    browserSearch:    ['Searching the web…', 'Searched the web'],
  };

  const pair = labels[toolName];
  if (pair) return status === 'calling' ? pair[0] : pair[1];

  const name = formatToolName(toolName);
  return status === 'calling' ? `Running ${name}…` : `Used ${name}`;
}

function formatToolName(toolName: string): string {
  return toolName.replace(/_/g, ' ');
}
