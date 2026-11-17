/** Read-aloud voice picker (engine default stored as no choice) with a sample button that plays like Read aloud. */

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Play, Square } from 'lucide-react';
import { useSettings } from '@shared/contexts/SettingsContext';
import { queryKeys } from '@shared/query/queryKeys';
import { readAloud } from '@services/readAloud.service';
import { useReadAloud, type ReadAloudState } from '@shared/hooks/useReadAloud';
import { CAPABILITIES_CONFIG } from '@config/capabilities.config';
import { LAYOUT } from '@config/layout.config';
import { READ_ALOUD_CONFIG, type ReadAloudEngine } from '@config/readAloud.config';
import { JOB_GLYPH } from '@shared/components';
import { CardRow, IconButton, IconTile, Picker } from '@shared/ui';

const { sampleText } = READ_ALOUD_CONFIG;
const SAMPLE_ICON: Record<ReadAloudState, typeof Play> = { idle: Play, preparing: Loader2, speaking: Square };

interface ReadAloudVoiceRowProps {
  engine: ReadAloudEngine;
  /** The engine can speak now (a voice model is downloaded). */
  ready: boolean;
}

export const ReadAloudVoiceRow: React.FC<ReadAloudVoiceRowProps> = ({ engine, ready }) => {
  const { settings, setSettings } = useSettings();
  // Re-read on focus: voices downloaded in System Settings › Spoken Content show up on return.
  const { data: voices = [] } = useQuery({
    queryKey: queryKeys.readAloudVoices(engine),
    queryFn: () => readAloud.voices(engine),
    refetchOnWindowFocus: true,
  });
  const sample = useReadAloud('voice-sample', sampleText);

  const defaultVoice = voices[0]?.id;
  const choose = (value: string) => setSettings({ readAloudVoice: value === defaultVoice ? undefined : value });

  return (
    <CardRow
      leading={<IconTile icon={JOB_GLYPH.voice} />}
      leadingAlign="row"
      title={CAPABILITIES_CONFIG.jobs.voice.title}
      actions={
        <div className="flex items-center gap-2">
          <IconButton
            icon={SAMPLE_ICON[sample.state]}
            spin={sample.state === 'preparing'}
            label={sample.state === 'idle' ? 'Play a sample' : 'Stop the sample'}
            size="sm"
            disabled={!ready}
            onClick={sample.toggle}
          />
          <div className={LAYOUT.capabilityPicker}>
            <Picker
              label="Voice"
              value={settings.readAloudVoice ?? defaultVoice}
              onChange={choose}
              placeholder=""
              groups={[{ options: voices.map((voice) => ({ value: voice.id, label: voice.detail ? `${voice.name} · ${voice.detail}` : voice.name })) }]}
            />
          </div>
        </div>
      }
    />
  );
};
