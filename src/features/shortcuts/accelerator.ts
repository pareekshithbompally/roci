/** Pure accelerator matching and labels; a bare-key shortcut never fires in a field or menu that owns the key. */

import {
  APP_SHORTCUTS,
  BARE_SHORTCUT_BLOCKERS,
  SHORTCUT_KEY_LABELS,
  SHORTCUT_KEYS,
  SHORTCUT_MODIFIERS,
} from '@config/shortcuts.config';
import type { AppShortcutId, ShortcutModifierFlag } from '@config/shortcuts.config';

type ModifierToken = keyof typeof SHORTCUT_MODIFIERS;

export interface ParsedAccelerator {
  flags: ReadonlySet<ShortcutModifierFlag>;
  /** `KeyboardEvent.key`, lower-cased. */
  key: string;
}

/** Every flag a match compares, in macOS display order (⌃⌥⇧⌘). */
const FLAG_ORDER: readonly ShortcutModifierFlag[] = ['ctrlKey', 'altKey', 'shiftKey', 'metaKey'];

const isModifier = (token: string): token is ModifierToken => token in SHORTCUT_MODIFIERS;

const keyOf = (token: string) => SHORTCUT_KEYS[token] ?? token;

/** Split an accelerator into its modifiers and key. Throws on an unknown modifier. */
export function parseAccelerator(accelerator: string): ParsedAccelerator {
  const tokens = accelerator.split('+');
  const keyToken = tokens.pop() ?? '';
  const flags = new Set<ShortcutModifierFlag>();
  for (const token of tokens) {
    if (!isModifier(token)) throw new Error(`Unknown modifier "${token}" in "${accelerator}"`);
    flags.add(SHORTCUT_MODIFIERS[token].flag);
  }
  if (!keyToken) throw new Error(`Accelerator "${accelerator}" has no key`);
  return { flags, key: keyOf(keyToken).toLowerCase() };
}

export function isShortcutCandidate(event: KeyboardEvent): boolean {
  return !event.defaultPrevented && !event.isComposing && !event.repeat;
}

/** Flags that make a shortcut safe to fire inside a text field. */
const COMMAND_FLAGS: readonly ShortcutModifierFlag[] = ['metaKey', 'ctrlKey', 'altKey'];

/** A bare key (no ⌘/⌃/⌥) belongs to the focused field or dialog, if any. */
function ownedByFocus(event: KeyboardEvent, accelerator: ParsedAccelerator): boolean {
  if (COMMAND_FLAGS.some((flag) => accelerator.flags.has(flag))) return false;
  return event.target instanceof Element && event.target.closest(BARE_SHORTCUT_BLOCKERS) !== null;
}

export function matchesAccelerator(event: KeyboardEvent, accelerator: ParsedAccelerator): boolean {
  return FLAG_ORDER.every((flag) => event[flag] === accelerator.flags.has(flag))
    && event.key.toLowerCase() === accelerator.key
    && !ownedByFocus(event, accelerator);
}

const PARSED_APP_SHORTCUTS = (Object.keys(APP_SHORTCUTS) as AppShortcutId[]).map(
  (id) => [id, parseAccelerator(APP_SHORTCUTS[id].accelerator)] as const,
);

/** The app shortcut this keydown triggers, or null. */
export function findAppShortcut(event: KeyboardEvent): AppShortcutId | null {
  if (!isShortcutCandidate(event)) return null;
  return PARSED_APP_SHORTCUTS.find(([, parsed]) => matchesAccelerator(event, parsed))?.[0] ?? null;
}

/** One glyph per flag (Command and CommandOrControl share ⌘; Option and Alt share ⌥). */
const FLAG_GLYPH = Object.fromEntries(
  Object.values(SHORTCUT_MODIFIERS).map(({ flag, glyph }) => [flag, glyph]),
) as Record<ShortcutModifierFlag, string>;

/** The keys to press, one per keycap, modifiers in macOS order: `CommandOrControl+Shift+K` → `['⇧', '⌘', 'K']`. */
export function acceleratorKeys(accelerator: string): string[] {
  const { flags, key } = parseAccelerator(accelerator);
  const glyphs = FLAG_ORDER.filter((flag) => flags.has(flag)).map((flag) => FLAG_GLYPH[flag]);
  return [...glyphs, SHORTCUT_KEY_LABELS[key] ?? key.toUpperCase()];
}


/** An app shortcut's keys, one per keycap, from the registry (`['⌘', 'K']`). */
export const shortcutKeys = (id: AppShortcutId): string[] => acceleratorKeys(APP_SHORTCUTS[id].accelerator);

/** An app shortcut as one label, for text (`⌘K`): its keys, joined. */
export const shortcutLabel = (id: AppShortcutId): string => shortcutKeys(id).join('');
