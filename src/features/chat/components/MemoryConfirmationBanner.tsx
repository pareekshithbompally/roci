/** Memories the AI proposed in this chat, on the shared proposal card above the chat box: Save, Not Now, or edit first. */

import React, { useState } from 'react';
import { Brain } from 'lucide-react';
import { Textarea } from '@shared/ui';
import { ProposalCard, type ProposalItem, FormDialog } from '@shared/components';
import { PERSONALIZATION_CONFIG } from '@config/personalization.config';
import { KNOWLEDGE_LIMITS } from '@config/knowledge.config';
import { PROPOSAL_STATE } from '@features/chat/stores/proposalQueue';
import { memoryProposalStore, useMemoryProposals, type MemoryProposal } from '@features/chat/stores/memoryProposalStore';

const COPY = PERSONALIZATION_CONFIG.memory.proposal;

const VERB: Record<MemoryProposal['action'], string | undefined> = { create: undefined, update: COPY.verbs.update, forget: COPY.verbs.forget };

const EditDialog: React.FC<{ proposal: MemoryProposal; onClose: () => void }> = ({ proposal, onClose }) => {
  const [text, setText] = useState(proposal.text);
  const save = () => {
    memoryProposalStore.edit(proposal.id, text.trim());
    onClose();
  };
  return (
    <FormDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={COPY.edit}
      size="md"
      submit={{ label: COPY.done, onPress: save, disabled: !text.trim() }}
      viewOnly
    >
      <Textarea rows={3} value={text} maxLength={KNOWLEDGE_LIMITS.memory} onChange={(e) => setText(e.target.value)} aria-label={COPY.edit} autoFocus />
    </FormDialog>
  );
};

export const MemoryConfirmationBanner: React.FC<{ chatId: string | undefined }> = ({ chatId }) => {
  const proposals = useMemoryProposals(chatId ?? null);
  const [editing, setEditing] = useState<MemoryProposal | null>(null);
  if (proposals.length === 0) return null;

  const items: ProposalItem[] = proposals.map((p) => ({
    id: p.id,
    title: p.action === 'update' ? `${p.originalText} → ${p.text}` : p.text,
    detail: p.about ? `${p.about.name} (${p.about.entity_type})` : undefined,
    verb: VERB[p.action],
    state: PROPOSAL_STATE[p.status],
    error: p.error,
    onEdit: p.action === 'forget' ? undefined : () => setEditing(p),
    onRemove: proposals.length > 1 ? () => memoryProposalStore.remove(p.id) : undefined,
  }));
  const saved = proposals.every((p) => p.status === 'committed');

  return (
    <>
      <ProposalCard
        icon={Brain}
        heading={saved ? COPY.saved : COPY.toConfirm(proposals.length)}
        items={items}
        confirmLabel={COPY.confirm}
        cancelLabel={COPY.cancel}
        onConfirm={() => void memoryProposalStore.commitAll(chatId ?? null)}
        onCancel={() => memoryProposalStore.cancelAll(chatId ?? null)}
      />
      {editing && <EditDialog proposal={editing} onClose={() => setEditing(null)} />}
    </>
  );
};
