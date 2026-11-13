/**
 * ToolsPicker — the composer's Tools picker. Same shell as the ModelPicker
 * (`CommandPopover`: search partition, grouped list, bounded height); each
 * tool group opens its tools in a side flyout on hover (`CommandFlyout`).
 *
 *   Built-in     Web search (native, per provider) · Meetings & chats ›
 *   MCP servers  one row per server, status + count + checkbox ›
 *   ─────────    approval mode · Manage MCP servers
 */

import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Globe,
  Info,
  Library,
  Plus,
  Settings2,
  ShieldCheck,
  ShieldQuestion,
  SlidersHorizontal,
  TriangleAlert,
} from 'lucide-react';
import { COMPONENT, SURFACE, TEXT } from '@config/theme.config';
import { TYPOGRAPHY_CLASSES } from '@config/typography.config';
import { useAppActions } from '@shared/stores/appStore';
import {
  Checkbox,
  CommandFlyout,
  CommandGroup,
  CommandItem,
  CommandPopover,
  CommandSeparator,
  cn,
} from '@shared/ui';
import type { CheckboxState } from '@shared/ui';
import { useToolCatalog } from '@features/chat/hooks';
import type { ToolCatalog } from '@features/chat/hooks';
import type { CatalogGroup } from '@features/chat/hooks/toolCatalog';
import { ServerIcon } from '@shared/components/ServerIcon';

/** Trailing hint text; color is added per use so link/warning tones win. */
const HINT_BASE = `${TYPOGRAPHY_CLASSES.settingsHelper} shrink-0 tabular-nums`;
const HINT = `${HINT_BASE} ${TEXT.faint}`;

export const ToolsPicker: React.FC = () => {
  const catalog = useToolCatalog();
  const [open, setOpen] = useState(false);
  const [flyout, setFlyout] = useState<string | null>(null);
  const { setCurrentView, setActiveSettingsPanel } = useAppActions();

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) setFlyout(null);
  };

  const openMcpSettings = () => {
    handleOpenChange(false);
    setActiveSettingsPanel('mcp');
    setCurrentView('settings');
  };

  const { enabledCount, webSearch, modelSupportsTools } = catalog;
  const showCount = modelSupportsTools && enabledCount > 0;

  return (
    <CommandPopover
      open={open}
      onOpenChange={handleOpenChange}
      searchPlaceholder="Search tools..."
      emptyText="No tools found"
      trigger={
        <button
          type="button"
          className={`${COMPONENT.composerPickerTrigger} ${SURFACE.hoverSubtle} ${TEXT.secondary} text-xs`}
          title="Tools"
          aria-label={`Tools, ${modelSupportsTools ? enabledCount : 0} on`}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          <span className="font-medium">Tools</span>
          {showCount && <span className={cn(COMPONENT.countPill, SURFACE.chip)}>{enabledCount}</span>}
          {webSearch.enabled && <Globe className={`w-3 h-3 ${TEXT.link}`} aria-label="Web search on" />}
          <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      }
    >
      <CommandGroup heading="Built-in">
        <WebSearchItem catalog={catalog} onHover={() => setFlyout(null)} />
        {modelSupportsTools ? (
          <GroupItem
            group={catalog.builtIn}
            icon={<Library className={ICON} />}
            catalog={catalog}
            flyout={flyout}
            setFlyout={setFlyout}
          />
        ) : (
          <CommandItem disabled value="tools unavailable" className="items-start">
            <Info className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${TEXT.faint}`} />
            <span className={`${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.muted}`}>
              {catalog.modelName} can’t use tools. Pick a model with tool calling to search meetings and use MCP servers.
            </span>
          </CommandItem>
        )}
      </CommandGroup>

      {modelSupportsTools && (
        <CommandGroup heading="MCP servers">
          {catalog.servers.map((group) => (
            <GroupItem key={group.key} group={group} catalog={catalog} flyout={flyout} setFlyout={setFlyout} />
          ))}
          {catalog.servers.length === 0 && (
            <CommandItem value="add mcp server" onSelect={openMcpSettings} onPointerEnter={() => setFlyout(null)}>
              <Plus className={ICON} />
              <span className="flex-1">Add MCP server</span>
              <Trailing hint="files, browsers, APIs" />
            </CommandItem>
          )}
        </CommandGroup>
      )}

      <CommandSeparator />
      <CommandGroup>
        <FooterItems askBeforeRunning={catalog.askBeforeRunning} onOpenSettings={openMcpSettings} onHover={() => setFlyout(null)} />
      </CommandGroup>
    </CommandPopover>
  );
};

// ── Row anatomy ──
// [icon 14] [label, flex] [hint] [checkbox slot] [chevron slot]
// Fixed-width slots keep every row's controls in the same columns.

interface TrailingProps {
  hint?: React.ReactNode;
  hintClassName?: string;
  check?: React.ReactNode;
  chevron?: boolean;
}

const Trailing: React.FC<TrailingProps> = ({ hint, hintClassName = HINT, check, chevron = false }) => (
  <>
    {hint !== undefined && <span className={hintClassName}>{hint}</span>}
    <span className={COMPONENT.pickerCheckSlot}>{check}</span>
    <span className={COMPONENT.pickerChevronSlot}>
      {chevron && <ChevronRight className={`w-3.5 h-3.5 ${TEXT.faint}`} />}
    </span>
  </>
);

const ICON = `w-3.5 h-3.5 shrink-0 ${TEXT.muted}`;

// ── Rows ──

const WebSearchItem: React.FC<{ catalog: ToolCatalog; onHover: () => void }> = ({ catalog, onHover }) => {
  const { webSearch } = catalog;
  return (
    <CommandItem
      value="web search browse internet"
      disabled={!webSearch.available}
      onSelect={webSearch.toggle}
      onPointerEnter={onHover}
    >
      <Globe className={ICON} />
      <span className="flex-1 truncate">Web search</span>
      <Trailing
        hint={webSearch.available ? `via ${webSearch.providerLabel}` : 'Not available for this model'}
        check={
          <Checkbox
            checked={webSearch.enabled}
            onCheckedChange={webSearch.toggle}
            disabled={!webSearch.available}
            aria-label="Web search"
          />
        }
      />
    </CommandItem>
  );
};

function groupState(group: CatalogGroup): CheckboxState {
  if (group.enabledCount === 0) return false;
  return group.enabledCount === group.tools.length ? true : 'indeterminate';
}

interface GroupItemProps {
  group: CatalogGroup;
  icon?: React.ReactNode;
  catalog: ToolCatalog;
  flyout: string | null;
  setFlyout: (key: string | null) => void;
}

/** One group row; hovering (or Enter) opens its tools beside it. */
const GroupItem: React.FC<GroupItemProps> = ({ group, icon, catalog, flyout, setFlyout }) => {
  const usable = (group.status === 'builtin' || group.status === 'connected') && group.tools.length > 0;
  const connecting = group.status === 'connecting' || catalog.connectingServer === group.label;

  const row = (
    <CommandItem
      value={`${group.label} ${group.tools.map((t) => t.name).join(' ')}`}
      onPointerEnter={() => setFlyout(usable ? group.key : null)}
      onSelect={() => (usable ? setFlyout(group.key) : group.status === 'off' && catalog.connectServer(group.label))}
      disabled={connecting}
    >
      {icon ?? <ServerIcon name={group.label} icon={group.icon} />}
      <span className={cn('flex-1 truncate', !usable && TEXT.muted)}>{group.label}</span>
      <GroupTrailing group={group} usable={usable} connecting={connecting} onToggle={(on) => catalog.setGroupEnabled(group, on)} />
    </CommandItem>
  );

  if (!usable) return row;

  return (
    <CommandFlyout
      open={flyout === group.key}
      onOpenChange={(next) => !next && setFlyout(null)}
      anchor={row}
      heading={group.label}
    >
      {group.tools.map((tool) => (
        <CommandItem
          key={tool.key}
          value={tool.name}
          onSelect={() => group.perTool && catalog.setToolEnabled(tool.key, !tool.enabled)}
          title={tool.description ?? undefined}
        >
          {group.perTool && (
            <Checkbox checked={tool.enabled} onCheckedChange={(on) => catalog.setToolEnabled(tool.key, on)} aria-label={tool.name} />
          )}
          <span className={cn('flex-1 truncate font-mono text-xs', tool.enabled ? TEXT.secondary : TEXT.faint)}>{tool.name}</span>
          {tool.destructive && (
            <span className={`${HINT_BASE} flex items-center gap-0.5 ${TEXT.warningCallout}`}>
              <TriangleAlert className="w-3 h-3" /> writes
            </span>
          )}
        </CommandItem>
      ))}
    </CommandFlyout>
  );
};

const GroupTrailing: React.FC<{
  group: CatalogGroup;
  usable: boolean;
  connecting: boolean;
  onToggle: (enabled: boolean) => void;
}> = ({ group, usable, connecting, onToggle }) => {
  if (connecting) return <Trailing hint="Connecting…" />;
  if (group.status === 'off') return <Trailing hint="Connect" hintClassName={`${HINT_BASE} ${TEXT.link}`} />;
  if (!usable) return <Trailing hint="No tools" />;
  return (
    <Trailing
      hint={`${group.enabledCount}/${group.tools.length}`}
      chevron
      check={
        <Checkbox
          checked={groupState(group)}
          onCheckedChange={onToggle}
          aria-label={`${groupState(group) === true ? 'Disable' : 'Enable'} all ${group.label} tools`}
        />
      }
    />
  );
};

const FooterItems: React.FC<{ askBeforeRunning: boolean; onOpenSettings: () => void; onHover: () => void }> = ({
  askBeforeRunning,
  onOpenSettings,
  onHover,
}) => {
  const ApprovalIcon = askBeforeRunning ? ShieldQuestion : ShieldCheck;
  return (
    <>
      <CommandItem value="tool approval permissions" onSelect={onOpenSettings} onPointerEnter={onHover}>
        <ApprovalIcon className={ICON} />
        <span className={cn('flex-1', TEXT.muted)}>
          {askBeforeRunning ? 'Asks before running MCP tools' : 'Runs MCP tools without asking'}
        </span>
        <Trailing />
      </CommandItem>
      <CommandItem value="manage mcp servers settings" onSelect={onOpenSettings} onPointerEnter={onHover}>
        <Settings2 className={ICON} />
        <span className={cn('flex-1', TEXT.muted)}>Manage MCP servers</span>
        <Trailing chevron />
      </CommandItem>
    </>
  );
};
