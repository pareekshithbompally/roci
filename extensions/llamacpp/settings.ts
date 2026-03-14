/**
 * LlamaCpp Extension Settings
 *
 * Persists extension-specific settings (e.g. HuggingFace token)
 * to disk in the llamacpp data directory.
 */

import { join } from '@tauri-apps/api/path';
import {
  exists,
  readTextFile,
  writeTextFile,
} from '@tauri-apps/plugin-fs';
import { getBaseDir } from './backend';

const SETTINGS_FILE = 'settings.json';

interface LlamaCppSettings {
  hfToken?: string;
}

async function getSettingsPath(): Promise<string> {
  const base = await getBaseDir();
  return await join(base, SETTINGS_FILE);
}

async function loadSettings(): Promise<LlamaCppSettings> {
  try {
    const path = await getSettingsPath();
    if (!(await exists(path))) return {};
    const raw = await readTextFile(path);
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function saveSettings(settings: LlamaCppSettings): Promise<void> {
  const path = await getSettingsPath();
  await writeTextFile(path, JSON.stringify(settings, null, 2));
}

/** Load the saved HuggingFace token */
export async function loadHfToken(): Promise<string | null> {
  const settings = await loadSettings();
  return settings.hfToken ?? null;
}

/** Save the HuggingFace token */
export async function saveHfToken(token: string): Promise<void> {
  const settings = await loadSettings();
  settings.hfToken = token || undefined;
  await saveSettings(settings);
}
