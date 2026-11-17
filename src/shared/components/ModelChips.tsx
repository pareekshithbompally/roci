/** A model's facts as chips (size, then what it can take and do), and its name with them: one look for every model list. */

import React from 'react';
import { AudioLines, Brain, Eye, HardDrive, Video, Wrench, type LucideIcon } from 'lucide-react';
import { Chip } from '@shared/ui';
import { useFormFactor } from '@platform/formFactor';
import type { ModelInfo } from '@services/modalities';

/** The capabilities a chip can show, in display order (text in and out is a given, so not shown). */
const CAPABILITY_CHIPS: ReadonlyArray<{ key: string; icon: LucideIcon; title: string; has: (info: ModelInfo) => boolean }> = [
  { key: 'vision', icon: Eye, title: 'Vision', has: (info) => !!info.modalities?.input?.includes('image') },
  { key: 'audio', icon: AudioLines, title: 'Audio input', has: (info) => !!info.modalities?.input?.includes('audio') },
  { key: 'video', icon: Video, title: 'Video input', has: (info) => !!info.modalities?.input?.includes('video') },
  { key: 'tools', icon: Wrench, title: 'Tool calling', has: (info) => !!info.capabilities?.toolCall },
  { key: 'reasoning', icon: Brain, title: 'Reasoning', has: (info) => !!info.capabilities?.reasoning },
];

export interface ModelChipsProps {
  /** Catalog info (modalities, capabilities); null while unknown. */
  info?: ModelInfo | null;
  /** Download or file size ("18.85 GB"). */
  size?: string;
  /** The model runs on this device (the size chip shows a drive). */
  onDevice?: boolean;
}

export const ModelChips: React.FC<ModelChipsProps> = ({ info, size, onDevice }) => {
  const capabilities = info ? CAPABILITY_CHIPS.filter((c) => c.has(info)) : [];
  if (!size && capabilities.length === 0) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {size && <Chip label={size} icon={onDevice ? HardDrive : undefined} />}
      {capabilities.map((c) => <Chip key={c.key} icon={c.icon} title={c.title} />)}
    </span>
  );
};

export interface ModelLabelProps extends ModelChipsProps {
  name: string;
}

/** A model's name and its chips: beside the name on a Mac, under it on a phone (a phone row is too narrow for both). */
export const ModelLabel: React.FC<ModelLabelProps> = ({ name, ...chips }) => {
  const phone = useFormFactor() === 'phone';
  return (
    <span className={phone ? 'flex min-w-0 flex-col items-start gap-1' : 'flex min-w-0 items-center gap-2'}>
      <span className="min-w-0 truncate">{name}</span>
      <ModelChips {...chips} />
    </span>
  );
};
