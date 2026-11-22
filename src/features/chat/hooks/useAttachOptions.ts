/** What the chat's model can be sent: the + menu's attach options its inputs allow, the file picker's filter, and screenshots. */

import { FileText, Image as ImageIcon, Music, NotebookText } from 'lucide-react';
import type { Modality } from '@config/modelSpine.config';
import { ATTACHMENT_TYPES } from '@config/chat.config';
import { profileOf } from '@services/ai/models';
import { useModelCatalog } from '@shared/hooks/useModelCatalog';
import { useChatModel } from './useChatModel';

const { pdf, text } = ATTACHMENT_TYPES;

/** Every attach option (`accept` filters the file picker); `takes` is the input the model needs for it. Text files are sent as
 *  their contents, so every chat model takes them. */
const ATTACH_OPTIONS: ReadonlyArray<{ label: string; icon: typeof FileText; accept: string; takes: Modality }> = [
  { label: 'Images', icon: ImageIcon, accept: 'image/*', takes: 'image' },
  { label: 'PDFs', icon: FileText, accept: `${pdf.mediaType},${pdf.extension}`, takes: 'pdf' },
  { label: 'Text files', icon: NotebookText, accept: text.extensions.join(','), takes: 'text' },
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
  const options = ATTACH_OPTIONS.filter((o) => input.includes(o.takes));
  const accept = [...options.map((o) => o.accept), ...(input.includes('video') ? ['video/*'] : [])].join(',');
  return { options, accept, images: input.includes('image') };
}
