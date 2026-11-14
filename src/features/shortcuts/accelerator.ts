/**
 * Accelerators → matching and labels. Pure; the registry and key vocabulary
 * live in `@config/shortcuts.config`.
 *
 * Acceptance — a keydown triggers an app shortcut only when:
 *  1. no focused component already handled it (`defaultPrevented`),
 *  2. it is not mid IME composition and not a key-repeat,
 *  3. its modifiers are exactly the accelerator's (⌘⇧K is not ⌘K), and
 *  4. its key is the accelerator's key, and
 *  5. a bare-key shortcut (Esc) is not aimed at a field, dialog, menu or list
 *     that owns that key (`BARE_SHORTCUT_BLOCKERS`).
 * ⌘ shortcuts fire everywhere, text fields included.
 * Kasset is macOS-only: `CommandOrControl` means ⌘.
 */

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

/** macOS label: `CommandOrControl+Shift+K` → `⇧⌘K`. */
export function formatAccelerator(accelerator: string): string {
  const { flags, key } = parseAccelerator(accelerator);
  const glyphs = FLAG_ORDER.filter((flag) => flags.has(flag)).map((flag) => FLAG_GLYPH[flag]);
  return `${glyphs.join('')}${SHORTCUT_KEY_LABELS[key] ?? key.toUpperCase()}`;
}

/** Label for an app shortcut, from the registry (`⌘K`). */
export function shortcutLabel(id: AppShortcutId): string {
  return formatAccelerator(APP_SHORTCUTS[id].accelerator);
}
