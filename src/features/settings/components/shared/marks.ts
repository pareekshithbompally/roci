/**
 * Capability marks shown on picker rows, defined once so a picker and the
 * copy that points at it show the same icon and name.
 */

import { Captions } from 'lucide-react';
import { TRANSCRIPTION_CONFIG } from '@config/transcription.config';
import type { ChoiceMark } from '@shared/utils/modelResolver';

/** A speech model on this Mac that shows dictation as it's spoken. */
export const LIVE_TRANSCRIPTION_MARK: ChoiceMark = { icon: Captions, label: TRANSCRIPTION_CONFIG.liveCopy.mark };
