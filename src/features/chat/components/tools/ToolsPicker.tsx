/** Composer Tools picker: its own searchable popover (not a menu entry) with per-group side flyouts. */

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
  type LucideIcon,
} from 'lucide-react';
import { PICKER } from '@config/layout.config';
import { useAppActions } from '@shared/stores/appStore';
import {
  Button,
  Checkbox,
  CommandFlyout,
  CommandGroup,
  CommandItem,
  CommandPopover,
  CommandSeparator,
  Icon,
  Text,
  cn,
} from '@shared/ui';
import type { CheckboxState, TextTone } from '@shared/ui';
import { useToolCatalog } from '@features/chat/hooks';
import type { ToolCatalog } from '@features/chat/hooks';
import type { CatalogGroup } from '@features/chat/hooks/toolCatalog';
import { ServerIcon } from '@shared/components';

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

  // Only live servers; disconnected ones are managed from Settings, not here.
  const liveServers = catalog.servers.filter(
    (g) => g.status === 'connected' || g.status === 'connecting',
  );

  return (
    <CommandPopover
      open={open}
      onOpenChange={handleOpenChange}
      searchPlaceholder="Search tools..."
      emptyText="No tools found"
      trigger={
        <Button
          variant="ghost"
          size="sm"
          title="Tools"
          aria-label={`Tools, ${modelSupportsTools ? enabledCount : 0} on`}
        >
          <Icon icon={SlidersHorizontal} size="xs" />
          Tools
          {webSearch.enabled && <Icon icon={Globe} size="xs" tone="accent" label="Web search on" />}
          <Icon icon={ChevronDown} size="xs" className={cn('transition-transform', open && 'rotate-180')} />
        </Button>
      }
    >
      <CommandGroup heading="Built-in">
        <WebSearchItem catalog={catalog} onHover={() => setFlyout(null)} />
        {modelSupportsTools ? (
          <GroupItem
            group={catalog.builtIn}
            icon={Library}
            catalog={catalog}
            flyout={flyout}
            setFlyout={setFlyout}
          />
        ) : (
          <CommandItem disabled value="tools unavailable" className="items-start">
            <Icon icon={Info} size="xs" tone="faint" className="mt-0.5 shrink-0" />
            <Text variant="helper" tone="muted">
              {catalog.modelName} can’t use tools. Pick a model with tool calling to search meetings and use MCP servers.
            </Text>
          </CommandItem>
        )}
      </CommandGroup>

      {modelSupportsTools && (
        <CommandGroup heading="MCP servers">
          {liveServers.map((group) => (
            <GroupItem key={group.key} group={group} catalog={catalog} flyout={flyout} setFlyout={setFlyout} />
          ))}
          {catalog.servers.length === 0 && (
            <CommandItem value="add mcp server" onSelect={openMcpSettings} onPointerEnter={() => setFlyout(null)}>
              <RowIcon icon={Plus} />
              <span className="flex-1">Add MCP server</span>
              <Trailing hint="files, browsers, APIs" />
            </CommandItem>
          )}
          {catalog.servers.length > 0 && liveServers.length === 0 && (
            <CommandItem value="manage mcp servers" onSelect={openMcpSettings} onPointerEnter={() => setFlyout(null)}>
              <RowIcon icon={Settings2} />
              <Text tone="muted" className="flex-1">No connected servers</Text>
              <Trailing chevron />
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
// Fixed-width slots (icon, label, hint, checkbox, chevron) keep every row's controls aligned.

interface TrailingProps {
  hint?: React.ReactNode;
  hintTone?: TextTone;
  check?: React.ReactNode;
  chevron?: boolean;
}

const Trailing: React.FC<TrailingProps> = ({ hint, hintTone = 'faint', check, chevron = false }) => (
  <>
    {hint !== undefined && <Text variant="helper" tone={hintTone} className="shrink-0 tabular-nums">{hint}</Text>}
    <span className={PICKER.checkSlot}>{check}</span>
    <span className={PICKER.chevronSlot}>
      {chevron && <Icon icon={ChevronRight} size="xs" tone="faint" />}
    </span>
  </>
);

const RowIcon: React.FC<{ icon: LucideIcon }> = ({ icon }) => <Icon icon={icon} size="xs" tone="muted" className="shrink-0" />;

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
      <RowIcon icon={Globe} />
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
  icon?: LucideIcon;
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
      {icon ? <RowIcon icon={icon} /> : <ServerIcon name={group.label} icon={group.icon} />}
      <Text tone={usable ? 'inherit' : 'muted'} truncate className="flex-1">{group.label}</Text>
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
          <Text variant="mono" tone={tool.enabled ? 'muted' : 'faint'} truncate className="flex-1">{tool.name}</Text>
          {tool.destructive && (
            <Text variant="helper" tone="warning" className="shrink-0 flex items-center gap-0.5">
              <Icon icon={TriangleAlert} size="xs" /> writes
            </Text>
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
  if (group.status === 'off') return <Trailing hint="Connect" hintTone="accent" />;
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
        <RowIcon icon={ApprovalIcon} />
        <Text tone="muted" className="flex-1">
          {askBeforeRunning ? 'Asks before running MCP tools' : 'Runs MCP tools without asking'}
        </Text>
        <Trailing />
      </CommandItem>
      <CommandItem value="manage mcp servers settings" onSelect={onOpenSettings} onPointerEnter={onHover}>
        <RowIcon icon={Settings2} />
        <Text tone="muted" className="flex-1">Manage MCP servers</Text>
        <Trailing chevron />
      </CommandItem>
    </>
  );
};
