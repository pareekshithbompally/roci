/** The app's own places (To-dos, Upcoming while the calendar is on, Knowledge, Gallery, Dictations): the one list the sidebar rows and
 *  the ⌘K palette's Go to group both read, so their names and icons never drift apart. */

import { CalendarDays, Images, Library, ListTodo, Mic, type LucideIcon } from 'lucide-react';
import { useSettings } from '@shared/contexts/SettingsContext';
import { isIntegrationEnabled } from '@shared/utils/integrations';
import { TODOS_CONFIG } from '@config/todos.config';
import { CALENDAR_CONFIG } from '@config/calendar.config';
import { GALLERY_CONFIG } from '@config/gallery.config';
import { DICTATIONS_CONFIG } from '@config/dictations.config';
import { KNOWLEDGE_LIBRARY } from '@config/knowledgeLibrary.config';
import type { ViewType } from '@shared/stores/appStore';

export interface Destination {
  view: Exclude<ViewType, 'home' | 'settings'>;
  icon: LucideIcon;
  label: string;
}

export function useDestinations(): Destination[] {
  const calendarOn = isIntegrationEnabled(useSettings().settings, 'calendar');
  return [
    { view: 'reminders', icon: ListTodo, label: TODOS_CONFIG.title },
    ...(calendarOn ? [{ view: 'calendar' as const, icon: CalendarDays, label: CALENDAR_CONFIG.title }] : []),
    { view: 'knowledge', icon: Library, label: KNOWLEDGE_LIBRARY.title },
    { view: 'gallery', icon: Images, label: GALLERY_CONFIG.title },
    { view: 'dictations', icon: Mic, label: DICTATIONS_CONFIG.title },
  ];
}
