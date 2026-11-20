/** The one way Roci writes a kept file: into its kind's folder, then registered as an asset row so it has an owner. */

import { exists, mkdir, remove, writeFile } from '@tauri-apps/plugin-fs';
import { appDataDir, join } from '@tauri-apps/api/path';
import { convertFileSrc } from '@tauri-apps/api/core';
import { StorageConfig } from '@config/storage.config';
import { store } from '@services/db';

export type AssetKind = keyof typeof StorageConfig.assetKinds;

/** File bytes and the extension they are saved with (`png`, `thumb.jpg`). */
export interface AssetFile {
  data: Uint8Array;
  extension: string;
}

export interface SaveAssetOptions {
  /** A smaller copy shown in grids (an image's thumbnail); goes with the asset. */
  preview?: AssetFile;
  /** What the kind records about the file (an image: prompt, model, aspect ratio). */
  meta?: object;
  durationSeconds?: number;
}

/** Where a saved asset lives: inside app data (what chats keep) and on this device now. */
export interface SavedAsset {
  appPath: string;
  path: string;
}

const dirs = new Map<AssetKind, Promise<string>>();

/** The kind's folder, created on first use. */
function kindDir(kind: AssetKind): Promise<string> {
  const known = dirs.get(kind);
  if (known) return known;
  const created = (async () => {
    const dir = await join(await appDataDir(), StorageConfig.assetKinds[kind].dir);
    if (!(await exists(dir))) await mkdir(dir, { recursive: true });
    return dir;
  })();
  dirs.set(kind, created);
  return created;
}

/** Removes files a failed save wrote; what can't be removed is left for the store's sweep. */
async function discard(paths: string[]): Promise<void> {
  await Promise.all(paths.map((path) =>
    remove(path).catch((error: unknown) => console.warn('[assetsService] Left for the sweep:', path, error))));
}

export const assetsService = {
  /** Writes the file (and its preview) and registers it; on any failure removes what it wrote and throws. */
  async save(kind: AssetKind, file: AssetFile, options: SaveAssetOptions = {}): Promise<SavedAsset> {
    const dir = await kindDir(kind);
    const folder = StorageConfig.assetKinds[kind].dir;
    const stem = crypto.randomUUID();
    const name = `${stem}.${file.extension}`;
    const path = await join(dir, name);
    const written: string[] = [];
    try {
      await writeFile(path, file.data);
      written.push(path);
      let previewPath: string | null = null;
      if (options.preview) {
        const previewName = `${stem}.${options.preview.extension}`;
        const previewFile = await join(dir, previewName);
        await writeFile(previewFile, options.preview.data);
        written.push(previewFile);
        previewPath = `${folder}/${previewName}`;
      }
      await store.assets.create({
        kind,
        path: `${folder}/${name}`,
        preview_path: previewPath,
        duration_seconds: options.durationSeconds ?? null,
        meta: options.meta ? JSON.stringify(options.meta) : null,
      });
    } catch (error: unknown) {
      await discard(written);
      throw error;
    }
    return { appPath: `${folder}/${name}`, path };
  },

  /** A URL the webview loads for a file in app data, through Tauri's asset protocol (scoped per kind in tauri.conf.json). */
  async fileUrl(appPath: string): Promise<string> {
    return convertFileSrc(await join(await appDataDir(), appPath));
  },
};
