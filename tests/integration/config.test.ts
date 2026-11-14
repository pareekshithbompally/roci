/**
 * Configuration Import Tests
 * 
 * Verifies all configuration files are properly structured and importable.
 */

import { describe, it, expect } from 'vitest';

describe('Configuration Files', () => {
  it('should import app config', async () => {
    const { APP_CONFIG } = await import('@config/app.config');
    expect(APP_CONFIG).toBeDefined();
    expect(APP_CONFIG.name).toBeDefined();
  });

  it('should import audio config', async () => {
    const { AUDIO_CONFIG } = await import('@config/audio.config');
    expect(AUDIO_CONFIG).toBeDefined();
    expect(AUDIO_CONFIG.recording).toBeDefined();
    expect(AUDIO_CONFIG.recording.sampleRate).toBeDefined();
  });

  it('should import storage config', async () => {
    const { StorageConfig } = await import('@config/storage.config');
    expect(StorageConfig).toBeDefined();
  });

  it('should import ui config', async () => {
    const { UI_CONFIG } = await import('@config/ui.config');
    expect(UI_CONFIG).toBeDefined();
  });

  it('should import shortcuts config', async () => {
    const { APP_SHORTCUTS, GLOBAL_SHORTCUTS } = await import('@config/shortcuts.config');
    expect(APP_SHORTCUTS.search).toBeDefined();
    expect(GLOBAL_SHORTCUTS['toggle-recording']).toBeDefined();
  });

  it('should import notifications config', async () => {
    const { NotificationType } = await import('@config/notifications.config');
    expect(NotificationType).toBeDefined();
  });
});
