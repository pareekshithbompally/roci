/**
 * CategoriesPanel Component (Workflow tab)
 *
 * Productivity settings: categories, summary extraction toggles, meeting defaults.
 */

import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { useSettings } from '@shared/contexts/SettingsContext';
import { useToast } from '@shared/contexts/ToastContext';

import { SettingsPage } from './shared';
import { Button, CardRow, Icon, Input, Section, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Surface, Switch, Text } from '@shared/ui';

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
    <SettingsPage title="Workflow" description="Categories, extraction preferences, and meeting defaults.">
      {/* Categories — compact inline management */}
      <Section title="Categories">
        <div className="py-3 space-y-3">
          <div className="flex gap-2">
            <Input
              type="text"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
              placeholder="Add category..."
              className="flex-1"
            />
            <Button variant="primary" size="sm" onClick={handleAddCategory} disabled={!newCategory.trim()}>
              <Icon icon={Plus} size="xs" />
              Add
            </Button>
          </div>

          {categories.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {categories.map((category) => (
                <Surface key={category} variant="inset" radius="md" className="inline-flex items-center gap-1.5 px-2.5 py-1">
                  <Text variant="label" tone="muted">{category}</Text>
                  <Button variant="dangerGhost" size="inline" onClick={() => handleRemoveCategory(category)} aria-label={`Remove ${category}`}>
                    <Icon icon={X} size="xs" />
                  </Button>
                </Surface>
              ))}
            </div>
          ) : (
            <Text as="p" variant="helper" tone="faint">
              No categories yet. The AI will assign general categories.
            </Text>
          )}
        </div>
      </Section>

      {/* Summary Extraction — what to extract from transcriptions */}
      <Section title="Summary Extraction">
        {extractionRows.map(({ key, label, description }) => (
          <CardRow
            key={key}
            title={label}
            description={description}
            actions={<Switch size="sm" checked={extraction[key]} onCheckedChange={(val) => setExtraction(key, val)} aria-label={label} />}
          />
        ))}
      </Section>

      <Section title="Meeting Defaults">
        <CardRow
          title="Auto-generate Title"
          description="Create a title from transcript content after processing."
          actions={
            <Switch
              size="sm"
              checked={meetingDefaults.autoTitle}
              onCheckedChange={(val) => setMeetingDefault({ autoTitle: val })}
              aria-label="Auto-generate title"
            />
          }
        />
        <CardRow
          title="Duration Reminder"
          description="Notify when a recording exceeds this length."
          actions={
            <div className="w-32">
              <Select
                value={String(meetingDefaults.durationReminderMinutes)}
                onValueChange={(val) => setMeetingDefault({ durationReminderMinutes: Number(val) })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {durationOptions.map(({ value, label }) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          }
        />
      </Section>
    </SettingsPage>
  );
};

export default CategoriesPanel;
