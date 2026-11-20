/** Capability marks for picker rows, defined once so pickers and copy show the same icon and name. */

import { Captions } from 'lucide-react';
import { TRANSCRIPTION_CONFIG } from '@config/transcription.config';
import type { ChoiceMark } from '@shared/utils/modelResolver';

/** A speech model on this Mac that shows dictation as it's spoken. */
export const LIVE_TRANSCRIPTION_MARK: ChoiceMark = { icon: Captions, label: TRANSCRIPTION_CONFIG.liveCopy.mark };

/** Shown in a value slot until its data loads, so rows keep their place. */
export const PENDING = '—';
