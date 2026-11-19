/** Pending todo proposals above the chat input, with batch confirm/cancel and per-item removal. */

import React, { useCallback, useState } from 'react';
import { formatWeekdayDate, formatShortDateTime } from '@shared/utils/formatters';
import {
  CheckCircle2,
  X,
  Pencil,
  Calendar,
  Clock,
  User,
  Link2,
  Loader2,
  AlertCircle,
  ListTodo,
  Check,
  type LucideIcon,
} from 'lucide-react';
import { useTodoProposals, todoProposalStore } from '@features/chat';
import type { TodoProposal } from '@features/chat';
import { Button, Icon, IconButton, Input, Surface, Text } from '@shared/ui';
import { TODOS_CONFIG } from '@config/todos.config';

type EditingState = { proposalId: string; field: 'text' | 'dueDate' | 'reminderDateTime' | 'owner' } | null;

const TodoConfirmationBanner: React.FC = () => {
  const proposals = useTodoProposals();
  const [editing, setEditing] = useState<EditingState>(null);
  const [editValue, setEditValue] = useState('');

  const handleStartEdit = useCallback((proposalId: string, field: EditingState extends null ? never : NonNullable<EditingState>['field'], currentValue: string) => {
    setEditing({ proposalId, field });
    setEditValue(currentValue);
  }, []);

  const handleSaveEdit = useCallback(() => {
    if (!editing) return;
    const value = editValue.trim() || null;
    todoProposalStore.updateField(editing.proposalId, editing.field, value);
    setEditing(null);
    setEditValue('');
  }, [editing, editValue]);

  const handleCancelEdit = useCallback(() => {
    setEditing(null);
    setEditValue('');
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSaveEdit();
    } else if (e.key === 'Escape') {
      handleCancelEdit();
    }
  }, [handleSaveEdit, handleCancelEdit]);

  const handleCommitAll = useCallback(async () => {
    await todoProposalStore.commitAll();
  }, []);

  const handleCancelAll = useCallback(() => {
    todoProposalStore.cancelAll();
  }, []);

  if (proposals.length === 0) return null;

  const pendingCount = proposals.filter(p => p.status === 'pending').length;
  const allCommitted = proposals.every(p => p.status === 'committed');
  const anyCommitting = proposals.some(p => p.status === 'committing');
  const hasErrors = proposals.some(p => p.status === 'error');
  const isDisabled = anyCommitting || allCommitted;

  return (
    <div className="px-12 pb-1.5">
      <Surface
        variant="field"
        radius="xl"
        className="px-4 py-3"
        role="region"
        aria-label="Todo confirmation"
      >
        {/* Header row */}
        <div className="flex items-center gap-2 mb-2">
          <Icon icon={ListTodo} size="sm" tone={allCommitted ? 'success' : hasErrors ? 'danger' : 'muted'} className="shrink-0" />
          <Text variant="bodyStrong" className="flex-1">
            {allCommitted
              ? `${proposals.length} todo${proposals.length > 1 ? 's' : ''} saved`
              : `${pendingCount} todo${pendingCount > 1 ? 's' : ''} to confirm`}
          </Text>

          {!isDisabled && (
            <div className="flex items-center gap-1.5">
              <Button variant="secondary" size="sm" onClick={handleCancelAll}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={handleCommitAll}>
                <Icon icon={Check} size="xs" />
                {pendingCount > 1 ? `Create All (${pendingCount})` : 'Create'}
              </Button>
            </div>
          )}

          {anyCommitting && (
            <div className="flex items-center gap-1.5">
              <Icon icon={Loader2} size="xs" tone="muted" className="animate-spin" />
              <Text variant="helper" tone="muted">Saving…</Text>
            </div>
          )}

          {allCommitted && (
            <Icon icon={CheckCircle2} size="sm" tone="success" />
          )}
        </div>

        {/* Proposal list */}
        <div className="flex flex-col gap-1.5">
          {proposals.map((p) => (
            <ProposalRow
              key={p.id}
              proposal={p}
              editing={editing?.proposalId === p.id ? editing : null}
              editValue={editing?.proposalId === p.id ? editValue : ''}
              onStartEdit={handleStartEdit}
              onEditChange={setEditValue}
              onSaveEdit={handleSaveEdit}
              onCancelEdit={handleCancelEdit}
              onKeyDown={handleKeyDown}
              onRemove={() => todoProposalStore.remove(p.id)}
              isDisabled={isDisabled}
              showRemove={proposals.length > 1}
            />
          ))}
        </div>
      </Surface>
    </div>
  );
};

// ── ProposalRow ──

interface ProposalRowProps {
  proposal: TodoProposal;
  editing: EditingState;
  editValue: string;
  onStartEdit: (id: string, field: NonNullable<EditingState>['field'], value: string) => void;
  onEditChange: (v: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onRemove: () => void;
  isDisabled: boolean;
  showRemove: boolean;
}

/** What a change does to an existing to-do, named on its card; null for a new one. */
function proposalVerb(p: TodoProposal): string | null {
  if (p.action === 'create') return null;
  if (p.action === 'delete') return 'Delete';
  if (p.done === true) return 'Mark done';
  if (p.done === false) return 'Reopen';
  return 'Update';
}

/** A new to-do, or an edit of one, shows its fields to adjust; a delete or done/reopen shows only its name. */
function showsFields(p: TodoProposal): boolean {
  return p.action === 'create' || (p.action === 'update' && p.done === null);
}

const ProposalRow: React.FC<ProposalRowProps> = ({
  proposal: p, editing, editValue,
  onStartEdit, onEditChange, onSaveEdit, onCancelEdit, onKeyDown,
  onRemove, isDisabled, showRemove,
}) => {
  const verb = proposalVerb(p);
  const committed = p.status === 'committed';
  const hasError = p.status === 'error';

  return (
    <div className="flex items-center gap-1.5 pl-6 flex-wrap">
      {/* Status indicator */}
      {committed && <Icon icon={CheckCircle2} size="xs" tone="success" className="shrink-0" />}
      {hasError && <Icon icon={AlertCircle} size="xs" tone="danger" className="shrink-0" />}

      {verb && (
        <Text variant="helper">
          {verb}: &ldquo;{p.originalText}&rdquo;
        </Text>
      )}
      {showsFields(p) && (
        <>
          {/* Task text chip */}
          <EditableChip
            icon={Pencil}
            value={p.text}
            placeholder="Task text"
            isEditing={editing?.field === 'text'}
            isDisabled={isDisabled}
            onStartEdit={() => onStartEdit(p.id, 'text', p.text)}
            editValue={editValue}
            onEditChange={onEditChange}
            onSave={onSaveEdit}
            onCancel={onCancelEdit}
            onKeyDown={onKeyDown}
            primary
          />

          {/* Due date chip */}
          <EditableChip
            icon={Calendar}
            value={p.dueDate ? formatWeekdayDate(new Date(p.dueDate + 'T00:00:00')) : null}
            placeholder="Due date"
            isEditing={editing?.field === 'dueDate'}
            isDisabled={isDisabled}
            onStartEdit={() => onStartEdit(p.id, 'dueDate', p.dueDate || '')}
            editValue={editValue}
            onEditChange={onEditChange}
            onSave={onSaveEdit}
            onCancel={onCancelEdit}
            onKeyDown={onKeyDown}
            inputType="date"
          />

          {/* Reminder chip */}
          <EditableChip
            icon={Clock}
            value={p.reminderDateTime ? formatShortDateTime(p.reminderDateTime) : null}
            placeholder="Reminder"
            isEditing={editing?.field === 'reminderDateTime'}
            isDisabled={isDisabled}
            onStartEdit={() => onStartEdit(p.id, 'reminderDateTime', p.reminderDateTime || '')}
            editValue={editValue}
            onEditChange={onEditChange}
            onSave={onSaveEdit}
            onCancel={onCancelEdit}
            onKeyDown={onKeyDown}
            inputType="datetime-local"
          />

          {/* Owner chip */}
          {p.owner && (
            <EditableChip
              icon={User}
              value={p.owner}
              placeholder="Assigned"
              isEditing={editing?.field === 'owner'}
              isDisabled={isDisabled}
              onStartEdit={() => onStartEdit(p.id, 'owner', p.owner || '')}
              editValue={editValue}
              onEditChange={onEditChange}
              onSave={onSaveEdit}
              onCancel={onCancelEdit}
              onKeyDown={onKeyDown}
            />
          )}

          {/* Meeting — read-only chip */}
          <Surface variant="inset" radius="md" className="inline-flex items-center gap-1 px-2 py-0.5">
            <Icon icon={Link2} size="xs" tone="muted" />
            <Text variant="helper" tone="muted">{p.meetingTitle ?? TODOS_CONFIG.general}</Text>
          </Surface>
        </>
      )}

      {/* Remove button (only in multi-todo mode) */}
      {showRemove && !isDisabled && (
        <IconButton icon={X} label="Remove this todo" size="sm" variant="dangerGhost" onClick={onRemove} />
      )}

      {/* Error text */}
      {hasError && p.error && (
        <Text variant="helper" tone="danger">{p.error}</Text>
      )}
    </div>
  );
};

// ── EditableChip ──

interface EditableChipProps {
  icon: LucideIcon;
  value: string | null;
  placeholder: string;
  isEditing: boolean;
  isDisabled: boolean;
  onStartEdit: () => void;
  editValue: string;
  onEditChange: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  inputType?: string;
  primary?: boolean;
}

const EditableChip: React.FC<EditableChipProps> = ({
  icon, value, placeholder, isEditing, isDisabled,
  onStartEdit, editValue, onEditChange, onSave, onCancel, onKeyDown,
  inputType, primary,
}) => {
  if (isEditing) {
    return (
      <div className="inline-flex items-center gap-1">
        <Input
          type={inputType || 'text'}
          value={editValue}
          onChange={(e) => onEditChange(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={onSave}
          className={primary ? 'min-w-48' : 'min-w-32'}
          autoFocus
        />
        <IconButton icon={X} label="Cancel edit" size="sm" onClick={onCancel} />
      </div>
    );
  }

  if (!value && !primary) return null;

  return (
    <Button
      variant={primary ? 'ghost' : 'secondary'}
      size="sm"
      onClick={isDisabled ? undefined : onStartEdit}
      disabled={isDisabled}
      title={isDisabled ? undefined : `Edit ${placeholder.toLowerCase()}`}
    >
      <Icon icon={icon} size="xs" tone={primary ? 'muted' : 'inherit'} />
      <Text variant="helper" tone={!value ? 'faint' : primary ? 'primary' : 'inherit'}>{value || placeholder}</Text>
    </Button>
  );
};

// ── Formatters ──


export default TodoConfirmationBanner;
