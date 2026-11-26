/** To-dos, in the spirit of Dictations: one search, then one rolling list of every to-do in its sections (Overdue, Today,
 *  Upcoming, No date, Completed), each a rich row (TodoRow). The ⋯ at the top chooses what shows; the + at the corner adds. */

import React from 'react';
import { Ellipsis, Inbox } from 'lucide-react';
import { IconButton, SearchField, Text, ViewHeader, ViewScroll } from '@shared/ui';
import { Menu, ScreenState, type MenuEntry } from '@shared/components';
import { startCreate } from '@shared/stores/createStore';
import { useGlobalTodos } from '@features/todos/hooks/useGlobalTodos';
import type { TodoFilter } from '@features/todos/utils/todoSections';
import { TodoRow } from './TodoRow';
import { LAYOUT } from '@config/layout.config';
import { TODOS_CONFIG } from '@config/todos.config';

const PAGE = TODOS_CONFIG.page;
const FILTERS = Object.keys(PAGE.filters) as TodoFilter[];

export const RemindersView: React.FC = () => {
  const { sections, hasAny, counts, filter, setFilter, searchQuery, setSearchQuery, isLoading } = useGlobalTodos();
  const show: MenuEntry[] = [
    { type: 'label', label: PAGE.show },
    ...FILTERS.map((key) => ({ type: 'check' as const, label: PAGE.filters[key], checked: filter === key, onSelect: () => setFilter(key) })),
  ];

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden animate-fade-in">
      <ViewHeader
        title={TODOS_CONFIG.title}
        detail={hasAny && PAGE.counts(counts.open, counts.done)}
        accessory={hasAny && <Menu label={PAGE.show} trigger={<IconButton icon={Ellipsis} label={PAGE.show} size="sm" />} items={show} />}
        primaryAction={{ label: TODOS_CONFIG.add, onPress: () => startCreate('todo') }}
      />
      <ViewScroll className={LAYOUT.fabClearance}>
        <ScreenState loading={isLoading} empty={!hasAny && { icon: Inbox, ...PAGE.empty }} className="space-y-3">
          <SearchField value={searchQuery} onChange={setSearchQuery} onCancel={() => setSearchQuery('')} placeholder={PAGE.search} />
          {sections.length === 0 && <Text as="p" variant="helper" tone="muted" className="px-2.5 py-2">{PAGE.noMatch}</Text>}
          {sections.map((section) => (
            <section key={section.key}>
              <Text as="h2" variant="label" tone={section.key === 'overdue' ? 'danger' : 'muted'} className="px-2.5 pb-1">{section.label}</Text>
              {section.todos.map((todo) => (
                <TodoRow key={todo.id} todo={todo} meetingId={todo.meetingId} meetingTitle={todo.meetingTitle} />
              ))}
            </section>
          ))}
        </ScreenState>
      </ViewScroll>
    </div>
  );
};

export default RemindersView;
