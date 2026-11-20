/** The switched-on tools' share of each message, as the context ring shows it; none when the model can't use tools. */

import type { ContextRingTools } from '@shared/ui';
import type { ToolCatalog } from '@features/chat/hooks';
import { TOOLS_MENU_COPY as COPY } from '@config/chatTools.config';
import { formatTokenCount } from '@extensions/usage/format';

export function toolsShare({ modelSupportsTools, enabledCount, enabledTokens }: ToolCatalog): ContextRingTools | undefined {
  if (!modelSupportsTools || enabledCount === 0) return undefined;
  return { total: `≈${formatTokenCount(enabledTokens)} tok`, note: COPY.toolCount(enabledCount) };
}
