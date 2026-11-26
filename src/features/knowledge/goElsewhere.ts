/** Leaving Knowledge for a meeting or a chat (to open it, or to ask about it there) always leaves the way back: the shell's
 *  back control returns to Knowledge as it was (its selection and filter are kept in the Knowledge store). */

import { leaveReturnPoint } from '@shared/stores/returnStore';
import { useAppStore } from '@shared/stores/appStore';
import { KNOWLEDGE_LIBRARY } from '@config/knowledgeLibrary.config';

export function goFromKnowledge(go: () => void): void {
  leaveReturnPoint({ label: KNOWLEDGE_LIBRARY.title, restore: () => useAppStore.getState().setCurrentView('knowledge') });
  go();
}
