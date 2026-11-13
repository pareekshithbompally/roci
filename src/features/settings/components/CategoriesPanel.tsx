/**
 * CategoriesPanel Component (Workflow tab)
 *
 * Productivity settings: categories, summary extraction toggles, meeting defaults.
 */

import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { useSettings } from '@shared/contexts/SettingsContext';
import { useToast } from '@shared/contexts/ToastContext';

import { TYPOGRAPHY_CLASSES } from '@config/typography.config';
import { SURFACE, BORDER, TEXT, COMPONENT, RADIUS, LAYOUT } from '@config/theme.config';
import { SettingsSection, Toggle } from './shared';
import { Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shared/ui';

export const CategoriesPanel: React.FC = () => {
  const { settings, setSettings, isLoading } = useSettings();
  const { showToast } = useToast();
  if (isLoading) return null;

  const [newCategory, setNewCategory] = useState('');

  const categories = settings.categories || [];
  const extraction = settings.summaryExtraction ?? {
    keyDiscussionPoints: true,
    decisionsMade: true,
    actionItems: true,
    nextSteps: true,
  };
  const meetingDefaults = settings.meetingDefaults ?? {
    autoTitle: true,
    durationReminderMinutes: 60,
  };

  const handleAddCategory = () => {
    if (!newCategory.trim()) return;
    if (categories.includes(newCategory.trim())) {
      showToast('This category already exists', 'warning');
      return;
    }
    setSettings({ categories: [...categories, newCategory.trim()] });
    setNewCategory('');
  };

  const handleRemoveCategory = (category: string) => {
    setSettings({ categories: categories.filter(c => c !== category) });
  };

  const setExtraction = (key: keyof typeof extraction, value: boolean) => {
    setSettings({ summaryExtraction: { ...extraction, [key]: value } });
  };

  const setMeetingDefault = (updates: Partial<typeof meetingDefaults>) => {
    setSettings({ meetingDefaults: { ...meetingDefaults, ...updates } });
  };

  const extractionRows: Array<{ key: keyof typeof extraction; label: string; description: string }> = [
    { key: 'actionItems', label: 'Action Items', description: 'Tasks, assignments, and to-dos' },
    { key: 'keyDiscussionPoints', label: 'Key Discussion Points', description: 'Main topics covered' },
    { key: 'decisionsMade', label: 'Decisions Made', description: 'Conclusions and agreements reached' },
    { key: 'nextSteps', label: 'Next Steps', description: 'Follow-up items and future plans' },
  ];

  const durationOptions = [
    { value: '0', label: 'Off' },
    { value: '30', label: '30 min' },
    { value: '45', label: '45 min' },
    { value: '60', label: '1 hour' },
    { value: '90', label: '1.5 hours' },
    { value: '120', label: '2 hours' },
  ];

  return (
    <div className={`h-full overflow-y-auto custom-scrollbar ${LAYOUT.settingsPadding} py-6`}>
    <div className={`${LAYOUT.settingsMaxWidth} mx-auto space-y-6`}>
      <div>
        <h3 className={`${TYPOGRAPHY_CLASSES.settingsTitle} ${TEXT.heading} mb-1`}>
          Workflow
        </h3>
        <p className={`${TYPOGRAPHY_CLASSES.settingsDescription} ${TEXT.muted}`}>
          Categories, extraction preferences, and meeting defaults.
        </p>
      </div>

      {/* Categories — compact inline management */}
      <SettingsSection title="Categories">
        <div className="space-y-3">
          {/* Add input */}
          <div className="flex gap-2">
            <Input
              type="text"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
              placeholder="Add category..."
              className="flex-1"
            />
            <Button variant="primary" size="sm" onClick={handleAddCategory}
              disabled={!newCategory.trim()}>
              <Plus className="w-3.5 h-3.5" />
              Add
            </Button>
          </div>

          {/* Category chips */}
          {categories.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {categories.map((category) => (
                <span
                  key={category}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 ${SURFACE.chip} border ${BORDER.default} ${RADIUS.md} ${TYPOGRAPHY_CLASSES.settingsButton} ${TEXT.secondary}`}
                >
                  {category}
                  <button
                    onClick={() => handleRemoveCategory(category)}
                    className={`${COMPONENT.destructiveHover} rounded transition-colors`}
                    aria-label={`Remove ${category}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <p className={`${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.faint}`}>
              No categories yet. The AI will assign general categories.
            </p>
          )}
        </div>
      </SettingsSection>

      {/* Summary Extraction — what to extract from transcriptions */}
      <SettingsSection title="Summary Extraction">
        <div className={`border ${BORDER.default} ${RADIUS.lg} ${SURFACE.card} divide-y ${BORDER.divide}`}>
          {extractionRows.map(({ key, label, description }) => (
            <div key={key} className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="min-w-0">
                <span className={`${TYPOGRAPHY_CLASSES.settingsInputLabel} ${TEXT.heading}`}>
                  {label}
                </span>
                <p className={`${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.faint} mt-0.5`}>
                  {description}
                </p>
              </div>
              <Toggle
                checked={extraction[key]}
                onChange={(val) => setExtraction(key, val)}
                label={label}
              />
            </div>
          ))}
        </div>
      </SettingsSection>

      {/* Meeting Defaults */}
      <SettingsSection title="Meeting Defaults">
        <div className={`border ${BORDER.default} ${RADIUS.lg} ${SURFACE.card} divide-y ${BORDER.divide}`}>
          {/* Auto-title */}
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <div className="min-w-0">
              <span className={`${TYPOGRAPHY_CLASSES.settingsInputLabel} ${TEXT.heading}`}>
                Auto-generate Title
              </span>
              <p className={`${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.faint} mt-0.5`}>
                Create a title from transcript content after processing.
              </p>
            </div>
            <Toggle
              checked={meetingDefaults.autoTitle}
              onChange={(val) => setMeetingDefault({ autoTitle: val })}
              label="Auto-generate title"
            />
          </div>

          {/* Duration reminder */}
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <div className="min-w-0 flex-1">
              <span className={`${TYPOGRAPHY_CLASSES.settingsInputLabel} ${TEXT.heading}`}>
                Duration Reminder
              </span>
              <p className={`${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.faint} mt-0.5`}>
                Notify when a recording exceeds this length.
              </p>
            </div>
            <div className="w-32 shrink-0">
              <Select
                value={String(meetingDefaults.durationReminderMinutes)}
                onValueChange={(val) => setMeetingDefault({ durationReminderMinutes: Number(val) })}
              >
                <SelectTrigger className={TYPOGRAPHY_CLASSES.settingsInput}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {durationOptions.map(({ value, label }) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </SettingsSection>

    </div>
    </div>
  );
};

export default CategoriesPanel;
