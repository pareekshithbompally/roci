/** Settings nav in the left sidebar; edits save on edit, so switching panels needs no dirty-state guard. */

import React from 'react';
import { Bell, Box, ChartColumnIncreasing, HardDrive, Info, Keyboard, Puzzle, Settings, Signature, Sparkles } from 'lucide-react';
import { SiModelcontextprotocol } from '@icons-pack/react-simple-icons';
import { useAppStore, useAppActions } from '@shared/stores/appStore';
import type { SettingsPanel as SettingsPanelType } from '@shared/stores/appStore';
import { platform } from '@platform/index';
import { hasIntegrations } from './IntegrationsPanel';
import { useThemeContext } from '@shared/contexts/ThemeContext';
import { UI_CONFIG } from '@config/ui.config';
import { IconTile, Row, RowGroupLabel, type TileGlyph } from '@shared/ui';

export interface SettingsNavItem {
  id: SettingsPanelType;
  label: string;
  icon: TileGlyph;
  /** Heading of the group the row sits in (App, AI, Data), on the Mac sidebar and the phone's Settings list. */
  group: string;
  /** False hides the section on devices without the feature; omitted means always shown. */
  available?: boolean;
  /** What the section holds, so the ⌘K palette finds it by those words too. */
  keywords: string[];
  /** What the pane covers: the line under its name in the pane's header (PaneHero). */
  description: string;
  /** The header's name when it isn't the pane's (About names the app). */
  heroTitle?: string;
}

export const SETTINGS_NAV_ITEMS: SettingsNavItem[] = [
  { id: 'providers', label: 'Providers', icon: Box, group: 'AI', keywords: ['api key', 'openai', 'anthropic', 'gemini', 'local models', 'ollama'], description: 'The AI services Roci can use: your own keys, your own servers, and models on this device.' },
  { id: 'defaultModels', label: 'Default Models', icon: Sparkles, group: 'AI', keywords: ['chat model', 'transcription', 'speech', 'summary', 'images'], description: 'The model Roci uses for each job: chat, transcription, summaries, speech and images.' },
  { id: 'personalization', label: 'Personalization', icon: Signature, group: 'AI', keywords: ['saved prompts', 'recipes', 'slash', 'memory', 'remember', 'what roci knows', 'prompts', 'custom instructions', 'about you', 'tone', 'response length', 'prompt templates', 'system prompt', 'vocabulary', 'custom vocabulary', 'terms', 'names', 'spelling', 'recognition boost', 'model tuning'], description: 'How Roci answers you, what it remembers, and the words it should hear right.' },
  { id: 'mcp', label: 'MCP Servers', icon: SiModelcontextprotocol, group: 'AI', available: platform.hasMcp, keywords: ['tools', 'servers'], description: 'Give chat tools from other apps and services.' },
  { id: 'storage', label: 'Storage', icon: HardDrive, group: 'Data', keywords: ['disk usage', 'space', 'keep', 'retention', 'delete', 'cache', 'search index', 'finder', 'models.dev', 'catalog'], description: 'What Roci keeps on this device, for how long, and the space it takes.' },
  { id: 'usage', label: 'Analytics', icon: ChartColumnIncreasing, group: 'Data', keywords: ['usage', 'cost', 'tokens', 'spend', 'prices', 'requests'], description: 'What your AI requests used and cost, and what each model charges.' },
  { id: 'general', label: 'General', icon: Settings, group: 'App', keywords: ['capture', 'audio source', 'microphone', 'imports', 'theme'], description: 'How Roci records, imports and looks.' },
  { id: 'notifications', label: 'Notifications', icon: Bell, group: 'App', available: platform.hasNotifications, keywords: ['meeting reminders', 'alerts'], description: 'Meeting reminders and alerts, and when Roci sends them.' },
  { id: 'integrations', label: 'Integrations', icon: Puzzle, group: 'App', available: hasIntegrations, keywords: ['calendar', 'reminders', 'apple notes', 'spotlight', 'hex', 'coding agents'], description: 'Connect Roci to Calendar, Reminders, Notes, Spotlight and your coding agents.' },
  { id: 'shortcuts', label: 'Shortcuts', icon: Keyboard, group: 'App', available: !platform.hasTouchScreen, keywords: ['keyboard', 'keys', 'hotkeys', 'global shortcuts'], description: 'The keys Roci answers to, in the app and anywhere on your Mac.' },
  { id: 'about', label: 'About', icon: Info, group: 'App', keywords: ['version', 'updates', 'acknowledgements', 'licences', 'open source', 'setup'], heroTitle: 'Roci', description: 'Private, local-first meeting notes with AI chat built in.' },
];


/** The sections this device has: what the sidebar, the phone's Settings list and the ⌘K palette all show. */
export const SETTINGS_SECTIONS = SETTINGS_NAV_ITEMS.filter(({ available }) => available !== false);

/** Those sections under their group headings, in list order: the one grouping the sidebar and the phone list share. */
export const SETTINGS_GROUPS = [...new Set(SETTINGS_SECTIONS.map(({ group }) => group))].map((group) => ({
  group,
  items: SETTINGS_SECTIONS.filter((item) => item.group === group),
}));

/** A pane's own icon (sidebar, phone list, pane header) in the current appearance; the line glyph stays for the ⌘K palette. */
export function usePaneArt(): (id: SettingsPanelType) => string {
  const { isDark } = useThemeContext();
  return (id) => `${UI_CONFIG.settingsArt}/${id}-${isDark ? 'dark' : 'light'}.webp`;
}

export const SettingsNav: React.FC = () => {
  const activePanel = useAppStore((s) => s.activeSettingsPanel);
  const { setActiveSettingsPanel } = useAppActions();
  const art = usePaneArt();


  return (
    <nav aria-label="Settings sections" className="flex flex-col">
      {SETTINGS_GROUPS.map(({ group, items }) => (
        <React.Fragment key={group}>
          <RowGroupLabel>{group}</RowGroupLabel>
          {items.map(({ id, label }) => (
            <Row
              key={id}
              selected={activePanel === id}
              onClick={() => setActiveSettingsPanel(id)}
              aria-current={activePanel === id ? 'page' : undefined}
            >
              <IconTile image={art(id)} />
              <span className="flex-1 text-left truncate">{label}</span>
            </Row>
          ))}
        </React.Fragment>
      ))}
    </nav>
  );
};

export default SettingsNav;
