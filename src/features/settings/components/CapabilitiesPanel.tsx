/**
 * CapabilitiesPanel — every model choice in one place, by job. Sources come
 * from Providers (keys, local servers) and switched-on Integrations (Apple
 * Intelligence for summaries and speech, Hex for speech). The composer's model
 * picker quick-switches chat; this sets the default.
 */

import React, { useMemo } from 'react';
import { AudioLines, MessageSquare, NotebookText, ScanSearch, Volume2, Waypoints, type LucideIcon } from 'lucide-react';
import { useSettings } from '@shared/contexts/SettingsContext';
import { useToast } from '@shared/contexts/ToastContext';
import { useOnDeviceModel } from '@shared/hooks/useOnDeviceModel';
import { ModelDownloadButton } from '@shared/components';
import { modelChoices, withSummaryModels, type ModelChoice } from '@shared/utils/modelResolver';
import { speechSelectionKey, speechSelectionOf } from '@services/ai/transcription';
import { CAPABILITIES_CONFIG } from '@config/capabilities.config';
import { useSpeechModelOptions } from '@features/settings/hooks/useSpeechModels';
import { CardRow, Icon, Section } from '@shared/ui';
import { ModelSelect, SettingsPage } from './shared';

const { jobs: JOBS, sameAsChat: SAME_AS_CHAT } = CAPABILITIES_CONFIG;

/** A capability row: job icon + title, its description, and its control (picker or download). */
const CapabilityRow: React.FC<{ icon: LucideIcon; job: { title: string; description: string }; children: React.ReactNode }> = ({ icon, job, children }) => (
  <CardRow
    leading={<Icon icon={icon} size="sm" tone="muted" />}
    title={job.title}
    description={job.description}
    actions={children}
  />
);

export const CapabilitiesPanel: React.FC = () => {
  const { settings, setSettings, providers } = useSettings();
  const { showToast } = useToast();
  const searchModel = useOnDeviceModel('rag');
  const voiceModel = useOnDeviceModel('voice');

  const chatChoices = useMemo(() => modelChoices(providers), [providers]);
  const summaryChoices = useMemo(() => modelChoices(withSummaryModels(providers, settings)), [providers, settings]);

  const speechOptions = useSpeechModelOptions();
  const speechChoices = useMemo<ModelChoice[]>(() => speechOptions.map((o) => ({
    value: speechSelectionKey(o),
    provider: o.provider,
    modelId: o.model,
    label: o.label,
    ready: o.ready,
    hint: o.hint,
  })), [speechOptions]);
  const speech = speechSelectionOf(settings);

  const setSpeech = (key: string) => {
    const option = speechOptions.find((o) => speechSelectionKey(o) === key);
    if (!option) return;
    setSettings({ transcriptionProvider: option.provider, transcriptionModel: option.model });
    showToast(`${option.label} is ready`, 'success');
  };

  return (
    <SettingsPage title="Capabilities" description={CAPABILITIES_CONFIG.description}>
      <Section title="Conversation">
        <CapabilityRow icon={MessageSquare} job={JOBS.chat}>
          <ModelSelect value={settings.chatModel || undefined} choices={chatChoices} onChange={(chatModel) => setSettings({ chatModel })} />
        </CapabilityRow>
      </Section>

      <Section title="Meetings">
        <CapabilityRow icon={AudioLines} job={JOBS.transcription}>
          <ModelSelect value={speech ? speechSelectionKey(speech) : undefined} choices={speechChoices} onChange={setSpeech} />
        </CapabilityRow>
        <CapabilityRow icon={NotebookText} job={JOBS.summaries}>
          <ModelSelect
            value={settings.analyzeModel || settings.chatModel || undefined}
            choices={summaryChoices}
            onChange={(analyzeModel) => setSettings({ analyzeModel })}
          />
        </CapabilityRow>
        <CapabilityRow icon={Waypoints} job={JOBS.knowledgeGraph}>
          <ModelSelect
            value={settings.kgExtractionModel || SAME_AS_CHAT.value}
            choices={chatChoices}
            leading={[SAME_AS_CHAT]}
            onChange={(id) => setSettings({ kgExtractionModel: id === SAME_AS_CHAT.value ? '' : id })}
          />
        </CapabilityRow>
      </Section>

      <Section title="On this Mac">
        <CapabilityRow icon={ScanSearch} job={JOBS.meetingSearch}>
          <ModelDownloadButton model={searchModel} allowRedownload />
        </CapabilityRow>
        <CapabilityRow icon={Volume2} job={JOBS.readAloud}>
          <ModelDownloadButton model={voiceModel} allowRedownload />
        </CapabilityRow>
      </Section>
    </SettingsPage>
  );
};
