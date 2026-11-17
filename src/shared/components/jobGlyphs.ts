/** Each AI job's list glyph (Default Models rows, Usage pages, on-device models): Lucide line icons. */

import { Captions, Image, Megaphone, MessageCircle, Quote, Search, AudioLines } from 'lucide-react';

export const JOB_GLYPH = {
  chat: MessageCircle,
  /** Speech shown as text: the captions badge. */
  transcription: Captions,
  /** Text spoken out loud. */
  readAloud: Megaphone,
  /** Who speaks. */
  voice: AudioLines,
  images: Image,
  summaries: Quote,
  meetingSearch: Search,
} as const;
