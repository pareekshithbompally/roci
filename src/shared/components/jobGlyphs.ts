/** Each AI job's list glyph (Default Models rows, Usage pages, on-device models): Lucide line icons. */

import { Captions, Heading, Image, Megaphone, MessageCircle, MessageCircleQuestion, Quote, Search, AudioLines } from 'lucide-react';

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
  /** A chat named for you. */
  chatTitles: Heading,
  /** Questions offered after a reply. */
  followUps: MessageCircleQuestion,
} as const;
