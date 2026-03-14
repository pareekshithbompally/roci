import React, { useState } from 'react';
import ActionItem from './ActionItem';
import { ActionItem as ActionItemType } from '../types';
import { AlertCircle, Plus, X, Calendar, Clock } from 'lucide-react';

interface TodoListProps {
  actionItems: ActionItemType[];
  onItemToggle: (itemId: string) => void;
  onAddItem?: (text: string, dueDate?: string) => void;
  onDeleteItem?: (itemId: string) => void;
  onUpdateItem?: (itemId: string, updates: { text?: string; dueDate?: string }) => void;
  title?: string;
}

/**
 * TodoList Component
 * 
 * Displays action items as an interactive checklist with:
 * - Toggle completion status
 * - Strikethrough for completed items
 * - Due date display
 * - Create new to-do item
 * - Delete functionality
 * - Smart deadline picker
 */
const TodoList: React.FC<TodoListProps> = ({ 
  actionItems, 
  onItemToggle,
  onAddItem,
  onDeleteItem,
  onUpdateItem,
  title = "To-Do List"
}) => {
  const [isCreating, setIsCreating] = useState(false);
  const [newItemText, setNewItemText] = useState("");
  const [newItemDate, setNewItemDate] = useState("");
  const [newItemTime, setNewItemTime] = useState("");

  const completedCount = actionItems.filter(item => item.completed).length;
  const totalCount = actionItems.length;
  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  const handleSaveItem = () => {
    if (newItemText.trim() && onAddItem) {
      let dueDateString: string | undefined;
      if (newItemDate) {
        // Format: "Jan 25, 2025" or "Jan 25, 2025 2:30 PM" if time is provided
        const date = new Date(newItemDate);
        const dateStr = date.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        });
        if (newItemTime) {
          dueDateString = `${dateStr} ${newItemTime}`;
        } else {
          dueDateString = dateStr;
        }
      }
      onAddItem(newItemText.trim(), dueDateString);
      setNewItemText("");
      setNewItemDate("");
      setNewItemTime("");
      setIsCreating(false);
    }
  };

  const handleCancel = () => {
    setNewItemText("");
    setNewItemDate("");
    setNewItemTime("");
    setIsCreating(false);
  };

  const hasItems = actionItems.length > 0;

  return (
    <div className="max-w-4xl space-y-4">
      {/* Inline header with progress and add button */}
      {!isCreating && (
        <div className="flex items-center gap-4">
          {/* Progress section - only show if there are items */}
          {hasItems && (
            <div className="flex items-center gap-3 flex-1">
              <span className="text-sm font-semibold text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                {completedCount}/{totalCount}
              </span>
              <div className="w-40 h-2.5 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 dark:bg-green-400 transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}
          {/* Add button - always on the right */}
          <button
            onClick={() => setIsCreating(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-semibold hover:opacity-90 transition-opacity ml-auto"
          >
            <Plus className="w-4 h-4" />
            Add To-Do
          </button>
        </div>
      )}

      {/* New to-do input */}
      {isCreating && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 space-y-4 animate-fade-in">
          <textarea
            value={newItemText}
            onChange={(e) => setNewItemText(e.target.value)}
            placeholder="What do you need to do?"
            className="w-full h-20 p-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-[15px] text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 outline-none focus:ring-2 focus:ring-zinc-400 dark:focus:ring-zinc-600 resize-none"
            autoFocus
          />

          {/* Deadline picker - compact layout */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wide text-zinc-600 dark:text-zinc-400 flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Deadline (optional)
            </label>
            <div className="flex gap-2">
              <input
                type="date"
                value={newItemDate}
                onChange={(e) => setNewItemDate(e.target.value)}
                className="flex-1 px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-zinc-400 dark:focus:ring-zinc-600"
              />
              <input
                type="time"
                value={newItemTime}
                onChange={(e) => setNewItemTime(e.target.value)}
                disabled={!newItemDate}
                className="w-28 px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-zinc-400 dark:focus:ring-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>
            {newItemDate && (
              <div className="text-xs text-zinc-500 dark:text-zinc-400">
                {newItemTime 
                  ? `Due: ${new Date(newItemDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at ${newItemTime}`
                  : `Due: ${new Date(newItemDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                }
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 justify-end pt-2">
            <button
              onClick={handleCancel}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors flex items-center gap-2"
            >
              <X className="w-4 h-4" />
              Cancel
            </button>
            <button
              onClick={handleSaveItem}
              disabled={!newItemText.trim()}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Create To-Do
            </button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!hasItems && !isCreating && (
        <div className="p-12 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-center">
          <AlertCircle className="w-10 h-10 text-zinc-300 dark:text-zinc-700 mx-auto mb-3" />
          <p className="text-sm text-zinc-500 dark:text-zinc-400">No to-do items yet. Create one to get started!</p>
        </div>
      )}

      {/* Action items list */}
      {hasItems && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl divide-y divide-zinc-200 dark:divide-zinc-800">
          {actionItems.map((item, index) => (
            <div key={item.id} className="relative group">
              <ActionItem 
                item={item} 
                onToggle={onItemToggle}
                onUpdate={onUpdateItem}
              />
              {/* Delete button on hover */}
              {onDeleteItem && (
                <button
                  onClick={() => onDeleteItem(item.id)}
                  className="absolute right-4 top-4 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 hover:bg-red-50 dark:hover:bg-red-950/30 rounded text-red-500 dark:text-red-400"
                  aria-label="Delete to-do"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TodoList;
