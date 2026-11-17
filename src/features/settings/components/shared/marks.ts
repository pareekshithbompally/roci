/** Capability marks for picker rows, and each AI job's tile glyph, defined once so every screen shows the same icon. */

import { Captions } from 'lucide-react';
import { TRANSCRIPTION_CONFIG } from '@config/transcription.config';
import type { ChoiceMark } from '@shared/utils/modelResolver';
import {
  ChatCircleIcon, ClosedCaptioningIcon, MagnifyingGlassIcon, MegaphoneIcon, MountainsIcon, QuotesIcon, UserSoundIcon,
} from '@phosphor-icons/react';

/** A speech model on this Mac that shows dictation as it's spoken. */
export const LIVE_TRANSCRIPTION_MARK: ChoiceMark = { icon: Captions, label: TRANSCRIPTION_CONFIG.liveCopy.mark };

/** Each AI job's tile glyph (Capabilities rows, Usage by feature, on-device models); Fill silhouettes only (see TileGlyph). */
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
