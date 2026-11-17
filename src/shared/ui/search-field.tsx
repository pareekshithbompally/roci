import { Loader2, Search } from 'lucide-react';
import { cn } from './utils';
import { Icon } from './icon';
import { SEARCH_FIELD } from './recipes';

export interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  /** Escape (or the field's own clear) ends the search. */
  onCancel?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
  /** Results are on their way: a spinner at the end. */
  busy?: boolean;
  className?: string;
}

/** The system search field (UISearchBar / NSSearchField look): a filled rounded bar with a magnifier; `type="search"`
 *  gives the platform's own clear button and Search key. */
export function SearchField({ value, onChange, onCancel, placeholder = 'Search', autoFocus, busy, className }: SearchFieldProps) {
  return (
    <div className={cn(SEARCH_FIELD, 'min-w-0', className)}>
      <Icon icon={Search} size="sm" />
      <input
        type="search"
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape') onCancel?.(); }}
        className="h-full min-w-0 flex-1 bg-transparent text-body text-primary outline-none placeholder:text-faint"
      />
      {busy && <Icon icon={Loader2} size="xs" className="shrink-0 animate-spin" />}
    </div>
  );
}
