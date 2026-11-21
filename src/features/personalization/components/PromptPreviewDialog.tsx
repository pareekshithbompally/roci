/** The chat instructions as Roci builds them now (the same builder a chat uses), with the user's selected tools. */

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, Text, Textarea } from '@shared/ui';
import { FormDialog } from '@shared/components';
import { PERSONALIZATION_CONFIG } from '@config/personalization.config';
import { chatToolPreferences } from '@config/chatTools.config';
import { buildChatSystemPrompt, formatChatTimeContext, NO_TOOLS } from '@core/ai';
import { selectedToolset } from '@extensions/tool-orchestrator';
import { itemCountsQuery } from '@shared/query/items';
import { useSettings } from '@shared/contexts/SettingsContext';
import { personalizationWith } from '@shared/utils/personalization';
import { useMemories } from '@features/personalization/hooks/useMemories';

const COPY = PERSONALIZATION_CONFIG.prompts.copy.preview;

export const PromptPreviewDialog: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { settings } = useSettings();
  const meetingCount = useQuery(itemCountsQuery).data?.meetings ?? 0;
  const { graph } = useMemories();
  const prompt = buildChatSystemPrompt({
    tools: { ...NO_TOOLS, ...selectedToolset(settings), webSearch: chatToolPreferences(settings).webSearch },
    modalities: { input: ['text'], output: ['text'] },
    meetingCount,
    timeContext: formatChatTimeContext(),
    personalization: personalizationWith(settings, graph),
  });

  return (
    <FormDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={COPY.title}
      footer={<Button onClick={onClose}>{COPY.close}</Button>}
    >
      <div className="space-y-3">
        <Text as="p" variant="helper" tone="muted">{COPY.note}</Text>
        <Textarea variant="code" value={prompt} readOnly aria-label={COPY.title} />
      </div>
    </FormDialog>
  );
};
