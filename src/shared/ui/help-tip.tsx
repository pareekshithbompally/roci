import React from 'react';
import { Info } from 'lucide-react';
import { IconButton } from './button';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { Text } from './text';

export interface HelpTipProps {
  /** The setting it explains, as the popover's heading. */
  title: string;
  /** The button's name for VoiceOver ("About Temperature"). */
  label: string;
  /** What the setting does, in a sentence or two. */
  children: React.ReactNode;
}

/** The ⓘ beside a setting: a popover (a sheet on iPhone) saying what it does and what higher and lower mean. */
export function HelpTip({ title, label, children }: HelpTipProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <IconButton icon={Info} size="sm" label={label} />
      </PopoverTrigger>
      {/* Read-only, so it never takes focus: inside a sheet, the sheet's focus trap would pull focus back and close it. */}
      <PopoverContent width="md" label={title} onOpenAutoFocus={(e) => e.preventDefault()}>
        <div className="flex flex-col gap-1 p-3">
          <Text variant="headline">{title}</Text>
          <Text as="p" variant="helper" tone="muted">{children}</Text>
        </div>
      </PopoverContent>
    </Popover>
  );
}
