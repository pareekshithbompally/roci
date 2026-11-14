import { describe, it, expect } from 'vitest';
import { APP_SHORTCUTS, GLOBAL_SHORTCUTS } from '@config/shortcuts.config';
import { parseAccelerator } from '@features/shortcuts/accelerator';
import { findAppShortcut, shortcutLabel } from '@features/shortcuts';

const keydown = (key: string, init: KeyboardEventInit = {}) =>
  new KeyboardEvent('keydown', { key, metaKey: true, cancelable: true, ...init });

describe('shortcuts', () => {
  it('every registry accelerator parses', () => {
    for (const { accelerator } of [...Object.values(APP_SHORTCUTS), ...Object.values(GLOBAL_SHORTCUTS)]) {
      expect(() => parseAccelerator(accelerator)).not.toThrow();
    }
  });

  it('recognises ⌘K ⌘L ⌘N ⌘, and labels them', () => {
    expect(['k', 'l', 'n', ','].map((key) => findAppShortcut(keydown(key))))
      .toEqual(['search', 'focusChat', 'newChat', 'openSettings']);
    expect(shortcutLabel('openSettings')).toBe('⌘,');
  });

  it('accepts only exact modifiers, no repeats, nothing already handled', () => {
    expect(findAppShortcut(keydown('k', { shiftKey: true }))).toBeNull();
    expect(findAppShortcut(keydown('k', { repeat: true }))).toBeNull();
    const handled = keydown('k');
    handled.preventDefault();
    expect(findAppShortcut(handled)).toBeNull();
  });

  it('Esc leaves settings from the page, never from a field that owns it', () => {
    const esc = (target: Element) => {
      const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
      Object.defineProperty(event, 'target', { value: target });
      return findAppShortcut(event);
    };
    expect(esc(document.body)).toBe('leaveSettings');
    expect(esc(document.createElement('input'))).toBeNull();
    expect(shortcutLabel('leaveSettings')).toBe('esc');
  });
});
