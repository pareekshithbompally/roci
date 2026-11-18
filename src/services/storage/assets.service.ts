/** Generated media under app data, one folder per kind (`images/`, `speech/`): `{uuid}.{ext}` beside a `{uuid}.json` of its details. */

import { exists, mkdir, readTextFile, rename, writeFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { appDataDir, join } from '@tauri-apps/api/path';
import { convertFileSrc } from '@tauri-apps/api/core';
import { StorageConfig } from '@config/storage.config';

/** A kind of generated media, named by its folder. */
export type AssetKind = 'images' | 'speech';

/** Where a saved asset lives: inside app data (what chats keep), on this device now, and its folder and file stem. */
export interface SavedAsset {
  appPath: string;
  path: string;
  dir: string;
  stem: string;
}

const dirs = new Map<AssetKind, Promise<string>>();

/** The kind's folder, created on first use. */
export function assetDir(kind: AssetKind): Promise<string> {
  const known = dirs.get(kind);
  if (known) return known;
  const created = (async () => {
    const dir = await join(await appDataDir(), StorageConfig.directories[kind]);
    if (!(await exists(dir))) await mkdir(dir, { recursive: true });
    return dir;
  })();
  dirs.set(kind, created);
  return created;
}

/** Writes beside an asset without a half-written file ever being read: a temporary name, then renamed into place. */
async function writeTextAtomically(path: string, text: string): Promise<void> {
  await writeTextFile(`${path}.tmp`, text);
  await rename(`${path}.tmp`, path);
}

export const assetsService = {
  /** Writes one asset and its details; throws when it can't. */
  async save<D extends object>(kind: AssetKind, data: Uint8Array, extension: string, details: D): Promise<SavedAsset> {
    const dir = await assetDir(kind);
    const stem = crypto.randomUUID();
    const name = `${stem}.${extension}`;
    const path = await join(dir, name);
    await writeFile(path, data);
    await writeTextAtomically(await join(dir, `${stem}.json`), JSON.stringify(details));
    return { appPath: `${StorageConfig.directories[kind]}/${name}`, path, dir, stem };
  },

  /** An asset's details, or null when it has none or they fail `isDetails`. */
  async readDetails<D>(dir: string, stem: string, isDetails: (value: Partial<D>) => boolean): Promise<D | null> {
    try {
      const details = JSON.parse(await readTextFile(await join(dir, `${stem}.json`))) as Partial<D>;
      return isDetails(details) ? (details as D) : null;
    } catch {
      return null;
    }
  },

  /** A URL the webview loads for a file in app data, through Tauri's asset protocol (scoped per kind in tauri.conf.json). */
  async fileUrl(appPath: string): Promise<string> {
    return convertFileSrc(await join(await appDataDir(), appPath));
  },
};
