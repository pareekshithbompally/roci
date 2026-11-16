/** Composer Tools picker: its own searchable popover (not a menu entry) with per-group side flyouts. */

import React, { useState } from 'react';
import {
  ChevronDown,
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
import { useAppActions } from '@shared/stores/appStore';
import {
  Button,
  Checkbox,
  CommandFlyout,
  CommandGroup,
  CommandItem,
  CommandPopover,
  CommandRow,
  CommandSeparator,
  Icon,
  Text,
  cn,
} from '@shared/ui';
import type { CheckboxState, CommandRowProps } from '@shared/ui';
import { useToolCatalog } from '@features/chat/hooks';
import type { ToolCatalog } from '@features/chat/hooks';
import type { CatalogGroup } from '@features/chat/hooks/toolCatalog';
import { ServerIcon } from '@shared/components';
import { platform } from '@platform/index';

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
          size="toolbar"
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

      {platform.supportsChildProcessMcp && modelSupportsTools && (
        <CommandGroup heading="MCP servers">
          {liveServers.map((group) => (
            <GroupItem key={group.key} group={group} catalog={catalog} flyout={flyout} setFlyout={setFlyout} />
          ))}
          {catalog.servers.length === 0 && (
            <CommandRow
              value="add mcp server"
              onSelect={openMcpSettings}
              onPointerEnter={() => setFlyout(null)}
              leading={<RowIcon icon={Plus} />}
              label="Add MCP server…"
              description="Files, browsers, APIs"
            />
          )}
          {catalog.servers.length > 0 && liveServers.length === 0 && (
            <CommandRow
              value="manage mcp servers"
              onSelect={openMcpSettings}
              onPointerEnter={() => setFlyout(null)}
              leading={<RowIcon icon={Settings2} />}
              label="No connected servers"
              labelTone="muted"
              description="Manage MCP servers…"
            />
          )}
        </CommandGroup>
      )}

      {platform.supportsChildProcessMcp && (
        <>
          <CommandSeparator />
          <CommandGroup>
            <FooterItems
              askBeforeRunning={catalog.askBeforeRunning}
              onAskChange={catalog.setAskBeforeRunning}
              onOpenSettings={openMcpSettings}
              onHover={() => setFlyout(null)}
            />
          </CommandGroup>
        </>
      )}
    </CommandPopover>
  );
};

/** A row's leading glyph, at the picker's icon size and tone. */
const RowIcon: React.FC<{ icon: LucideIcon }> = ({ icon }) => <Icon icon={icon} size="xs" tone="muted" className="shrink-0" />;

// ── Rows ──

const WebSearchItem: React.FC<{ catalog: ToolCatalog; onHover: () => void }> = ({ catalog, onHover }) => {
  const { webSearch } = catalog;
  return (
    <CommandRow
      value="web search browse internet"
      disabled={!webSearch.available}
      onSelect={webSearch.toggle}
      onPointerEnter={onHover}
      leading={<RowIcon icon={Globe} />}
      label="Web search"
      description={webSearch.available ? `via ${webSearch.providerLabel}` : 'Not available for this model'}
      check={
        <Checkbox
          checked={webSearch.enabled}
          onCheckedChange={webSearch.toggle}
          disabled={!webSearch.available}
          aria-label="Web search"
        />
      }
      chevron={false}
    />
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
    <CommandRow
      value={`${group.label} ${group.tools.map((t) => t.name).join(' ')}`}
      onPointerEnter={() => setFlyout(usable ? group.key : null)}
      onSelect={() => (usable ? setFlyout(group.key) : group.status === 'off' && catalog.connectServer(group.label))}
      disabled={connecting}
      leading={icon ? <RowIcon icon={icon} /> : <ServerIcon name={group.label} icon={group.icon} />}
      label={group.label}
      labelTone={usable ? 'inherit' : 'muted'}
      {...groupColumns(group, usable, connecting, (on) => catalog.setGroupEnabled(group, on))}
    />
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

/** A group row's trailing columns: its state while connecting or off (check and chevron kept empty so it lines up), else tools on of total, a checkbox and its flyout. */
function groupColumns(
  group: CatalogGroup,
  usable: boolean,
  connecting: boolean,
  onToggle: (enabled: boolean) => void,
): Pick<CommandRowProps, 'meta' | 'metaTone' | 'check' | 'chevron'> {
  const empty = { check: null, chevron: false };
  if (connecting) return { meta: 'Connecting…', ...empty };
  if (group.status === 'off') return { meta: 'Connect', metaTone: 'accent', ...empty };
  if (!usable) return { meta: 'No tools', ...empty };
  return {
    meta: `${group.enabledCount}/${group.tools.length}`,
    chevron: true,
    check: (
      <Checkbox
        checked={groupState(group)}
        onCheckedChange={onToggle}
        aria-label={`${groupState(group) === true ? 'Disable' : 'Enable'} all ${group.label} tools`}
      />
    ),
  };
}

/** The approval setting, toggled right here, and the way to MCP settings. */
const FooterItems: React.FC<{
  askBeforeRunning: boolean;
  onAskChange: (ask: boolean) => void;
  onOpenSettings: () => void;
  onHover: () => void;
}> = ({ askBeforeRunning, onAskChange, onOpenSettings, onHover }) => {
  const ApprovalIcon = askBeforeRunning ? ShieldQuestion : ShieldCheck;
  return (
    <>
      <CommandRow
        value="ask before running mcp tools approval permissions"
        onSelect={() => onAskChange(!askBeforeRunning)}
        onPointerEnter={onHover}
        leading={<RowIcon icon={ApprovalIcon} />}
        label="Ask before running MCP tools"
        check={<Checkbox checked={askBeforeRunning} onCheckedChange={(on) => onAskChange(on === true)} aria-label="Ask before running MCP tools" />}
      />
      <CommandRow
        value="manage mcp servers settings"
        onSelect={onOpenSettings}
        onPointerEnter={onHover}
        leading={<RowIcon icon={Settings2} />}
        label="Manage MCP servers…"
        labelTone="muted"
      />
    </>
  );
};
