/**
 * CategoriesPanel Component
 * 
 * Settings for managing categories with save functionality.
 */

import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { useSettings } from '@shared/contexts/SettingsContext';
import { useToast } from '@shared/contexts/ToastContext';
import { useUnsavedChanges } from '@shared/contexts/UnsavedChangesContext';
import { useSettingsSave } from '../hooks/useSettingsSave';
import { SettingsSaveButton } from './SettingsSaveButton';
import { TYPOGRAPHY_CLASSES } from '@config/typography.config';
import { SURFACE, BORDER, TEXT, COMPONENT, RADIUS } from '@config/theme.config';

export const CategoriesPanel: React.FC = () => {
  const { settings, setSettings } = useSettings();
  const { showToast } = useToast();
  const { setHasUnsavedChanges } = useUnsavedChanges();
  const { isSaving, hasUnsavedChanges, save } = useSettingsSave('Categories');

  const [newCategory, setNewCategory] = useState('');

  const categories = settings.categories || [];

  const handleAddCategory = () => {
    if (!newCategory.trim()) return;
    if (categories.includes(newCategory.trim())) {
      showToast('This category already exists', 'warning');
      return;
    }
    setSettings({ categories: [...categories, newCategory.trim()] });
    setNewCategory('');
    setHasUnsavedChanges(true, 'categories');
  };

  const handleRemoveCategory = (category: string) => {
    setSettings({ categories: categories.filter(c => c !== category) });
    setHasUnsavedChanges(true, 'categories');
  };

  return (
    <div className="space-y-8">
      <div>
        <h3 className={`${TYPOGRAPHY_CLASSES.settingsTitle} ${TEXT.heading} mb-1`}>
          Categories
        </h3>
        <p className={`${TYPOGRAPHY_CLASSES.settingsDescription} ${TEXT.muted}`}>
          Manage the categories used to organize your recordings.
        </p>
      </div>

      {/* Add category */}
      <div className="flex gap-2">
        <input
          type="text"
          value={newCategory}
          onChange={(e) => setNewCategory(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
          placeholder="New category name"
          className={`flex-1 px-4 py-2.5 ${COMPONENT.settingsInput} ${TYPOGRAPHY_CLASSES.settingsInput}`}
        />
        <button
          onClick={handleAddCategory}
          disabled={!newCategory.trim()}
          className={`flex items-center gap-2 px-4 py-2.5 ${COMPONENT.primaryButton} ${RADIUS.md} ${TYPOGRAPHY_CLASSES.settingsButton} disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          <Plus className="w-4 h-4" />
          Add
        </button>
      </div>

      {/* Category list */}
      <div className="space-y-2">
        {categories.map((category) => (
          <div
            key={category}
            className={`flex items-center justify-between p-3 ${SURFACE.subtle} border ${BORDER.default} ${RADIUS.md}`}
          >
            <span className={`${TYPOGRAPHY_CLASSES.settingsInput} ${TEXT.secondary}`}>{category}</span>
            <button
              onClick={() => handleRemoveCategory(category)}
              className={`p-1.5 ${COMPONENT.destructiveHover} ${RADIUS.md} transition-colors`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}

        {categories.length === 0 && (
          <div className={`text-center py-8 ${TEXT.faint} ${TYPOGRAPHY_CLASSES.settingsHelper}`}>
            No categories yet. Add one above.
          </div>
        )}
      </div>

      {/* Save Button */}
      <SettingsSaveButton
        isSaving={isSaving}
        hasUnsavedChanges={hasUnsavedChanges}
        onSave={save}
      />
    </div>
  );
};

export default CategoriesPanel;
