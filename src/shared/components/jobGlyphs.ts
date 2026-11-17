/** Each AI job's tile glyph (Capabilities rows, Usage pages, on-device models); Fill silhouettes only (see TileGlyph). */

import {
  ChatCircleIcon, ClosedCaptioningIcon, MagnifyingGlassIcon, MegaphoneIcon, MountainsIcon, QuotesIcon, UserSoundIcon,
} from '@phosphor-icons/react';

export const JOB_GLYPH = {
  chat: ChatCircleIcon,
  /** Speech shown as text: the captions badge. */
  transcription: ClosedCaptioningIcon,
  /** Text spoken out loud. */
  readAloud: MegaphoneIcon,
  /** Who speaks. */
  voice: UserSoundIcon,
  images: MountainsIcon,
  summaries: QuotesIcon,
  meetingSearch: MagnifyingGlassIcon,
} as const;
