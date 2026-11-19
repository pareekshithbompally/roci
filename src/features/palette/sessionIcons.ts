/** A meeting's and a chat's glyph in the palette (recents and search results alike). */

import { AudioWaveform, MessageSquare } from 'lucide-react';

export const SESSION_ICON = { meeting: AudioWaveform, chat: MessageSquare } as const;
