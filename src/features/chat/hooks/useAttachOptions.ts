/** What the chat's model can be sent: the + menu's attach options its inputs allow, the file picker's filter, and screenshots. */

import { FileText, Image as ImageIcon, Music } from 'lucide-react';
import type { Modality } from '@config/modelSpine.config';
import { profileOf } from '@services/ai/models';
import { useModelCatalog } from '@shared/hooks/useModelCatalog';
import { useChatModel } from './useChatModel';

/** Every attach option (`accept` filters the file picker); `takes` is the input the model needs for it (null: always offered). */
const ATTACH_OPTIONS: ReadonlyArray<{ label: string; icon: typeof FileText; accept: string; takes: Modality | null }> = [
  { label: 'Images', icon: ImageIcon, accept: 'image/*', takes: 'image' },
  { label: 'Files', icon: FileText, accept: '.pdf,.txt,.md,.csv,.json,.doc,.docx', takes: null },
  { label: 'Audio', icon: Music, accept: 'audio/*', takes: 'audio' },
];

export type AttachOption = (typeof ATTACH_OPTIONS)[number];

export interface AttachOptions {
  options: AttachOption[];
  /** The file picker's filter: the options' types, plus video when the model watches it. */
  accept: string;
  /** Takes images, so screenshots can be attached. */
  images: boolean;
}

export function useAttachOptions(): AttachOptions {
  useModelCatalog();
  const resolved = useChatModel();
  const input = resolved ? profileOf(resolved.provider, resolved.model).input : [];
  const options = ATTACH_OPTIONS.filter((o) => o.takes === null || input.includes(o.takes));
  const accept = [...options.map((o) => o.accept), ...(input.includes('video') ? ['video/*'] : [])].join(',');
  return { options, accept, images: input.includes('image') };
}
