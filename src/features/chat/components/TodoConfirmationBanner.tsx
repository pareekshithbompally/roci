/**
 * TodoConfirmationBanner
 *
 * Renders a list of pending todo proposals above chat input.
 * Supports batch confirm/cancel and individual removal.
 * Matches ChatInput styling: same px-12 wrapper, SURFACE.input, BORDER.default, rounded-2xl.
 */

import React, { useCallback, useState } from 'react';
import {
  CheckCircle2,
  X,
  Pencil,
  Calendar,
  Clock,
  User,
  Link2,
  Trash2,
  Loader2,
  AlertCircle,
  ListTodo,
  Check,
} from 'lucide-react';
import { useTodoProposals, todoProposalStore } from '../stores/todoProposalStore';
import type { TodoProposal } from '../stores/todoProposalStore';
import { SURFACE, BORDER, TEXT, COMPONENT } from '@config/theme.config';

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
      <div
        className={`${allCommitted ? SURFACE.successCallout : hasErrors ? SURFACE.errorCallout : SURFACE.input} 
          border ${allCommitted ? BORDER.successCallout : hasErrors ? BORDER.errorCallout : BORDER.default} 
          rounded-2xl px-4 py-3 transition-colors`}
        role="region"
        aria-label="Todo confirmation"
      >
        {/* Header row */}
        <div className="flex items-center gap-2 mb-2">
          <ListTodo className={`w-4 h-4 flex-shrink-0 ${allCommitted ? 'text-green-600 dark:text-green-400' : TEXT.secondary}`} />
          <span className={`text-sm font-medium ${TEXT.primary} flex-1`}>
            {allCommitted
              ? `${proposals.length} todo${proposals.length > 1 ? 's' : ''} saved`
              : `${pendingCount} todo${pendingCount > 1 ? 's' : ''} to confirm`}
          </span>

          {!isDisabled && (
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleCancelAll}
                className={`px-2.5 py-1 text-xs rounded-lg ${COMPONENT.secondaryButton}`}
              >
                Cancel
              </button>
              <button
                onClick={handleCommitAll}
                className={`px-2.5 py-1 text-xs rounded-lg flex items-center gap-1 ${COMPONENT.primaryButton}`}
              >
                <Check className="w-3 h-3" />
                {pendingCount > 1 ? `Create All (${pendingCount})` : 'Create'}
              </button>
            </div>
          )}

          {anyCommitting && (
            <div className="flex items-center gap-1.5 text-xs">
              <Loader2 className={`w-3.5 h-3.5 animate-spin ${TEXT.muted}`} />
              <span className={TEXT.muted}>Saving…</span>
            </div>
          )}

          {allCommitted && (
            <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
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
      </div>
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

const ProposalRow: React.FC<ProposalRowProps> = ({
  proposal: p, editing, editValue,
  onStartEdit, onEditChange, onSaveEdit, onCancelEdit, onKeyDown,
  onRemove, isDisabled, showRemove,
}) => {
  const isCreate = p.action === 'create';
  const committed = p.status === 'committed';
  const hasError = p.status === 'error';

  return (
    <div className="flex items-center gap-1.5 pl-6 flex-wrap">
      {/* Status indicator */}
      {committed && <CheckCircle2 className="w-3.5 h-3.5 text-green-600 dark:text-green-400 flex-shrink-0" />}
      {hasError && <AlertCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />}

      {/* For toggle/delete — show matched text */}
      {!isCreate && p.matchedTodoText ? (
        <span className={`text-xs ${TEXT.primary}`}>
          {p.action === 'toggle' ? 'Complete' : p.action === 'delete' ? 'Delete' : 'Update'}: &ldquo;{p.matchedTodoText}&rdquo;
        </span>
      ) : (
        <>
          {/* Task text chip */}
          <EditableChip
            icon={<Pencil className="w-3 h-3" />}
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
            icon={<Calendar className="w-3 h-3" />}
            value={p.dueDate ? formatDate(p.dueDate) : null}
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
            icon={<Clock className="w-3 h-3" />}
            value={p.reminderDateTime ? formatDateTime(p.reminderDateTime) : null}
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
              icon={<User className="w-3 h-3" />}
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
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-md ${SURFACE.chip} ${TEXT.muted}`}>
            <Link2 className="w-3 h-3" />
            {p.isGeneral ? 'General' : p.meetingTitle}
          </span>
        </>
      )}

      {/* Remove button (only in multi-todo mode) */}
      {showRemove && !isDisabled && (
        <button
          onClick={onRemove}
          className={`p-0.5 rounded ${TEXT.faint} hover:text-red-500 transition-colors`}
          aria-label="Remove this todo"
        >
          <X className="w-3 h-3" />
        </button>
      )}

      {/* Error text */}
      {hasError && p.error && (
        <span className="text-xs text-red-600 dark:text-red-400">{p.error}</span>
      )}
    </div>
  );
};

// ── EditableChip ──

interface EditableChipProps {
  icon: React.ReactNode;
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
        <input
          type={inputType || 'text'}
          value={editValue}
          onChange={(e) => onEditChange(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={onSave}
          className={`${COMPONENT.inlineInput} px-2 py-0.5 text-xs ${primary ? 'min-w-[200px]' : 'min-w-[120px]'} h-6`}
          autoFocus
        />
        <button onClick={onCancel} className={`p-0.5 ${TEXT.faint} hover:${TEXT.secondary}`}>
          <X className="w-3 h-3" />
        </button>
      </div>
    );
  }

  if (!value && !primary) return null;

  return (
    <button
      onClick={isDisabled ? undefined : onStartEdit}
      disabled={isDisabled}
      className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-md transition-colors
        ${primary
          ? `${TEXT.primary} font-medium`
          : `${SURFACE.chip} ${TEXT.secondary} ${!isDisabled ? `hover:${SURFACE.selected}` : ''}`
        }
        ${!isDisabled && !primary ? 'cursor-pointer' : ''}
        ${isDisabled ? 'cursor-default' : ''}`}
      title={isDisabled ? undefined : `Edit ${placeholder.toLowerCase()}`}
    >
      <span className={primary ? TEXT.secondary : ''}>{icon}</span>
      <span className={!value ? TEXT.faint : ''}>{value || placeholder}</span>
    </button>
  );
};

// ── Formatters ──

function formatDate(iso: string): string {
  try {
    return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
    });
  } catch {
    return iso;
  }
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default TodoConfirmationBanner;
