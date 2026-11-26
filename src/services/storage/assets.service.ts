/** The one way Roci writes a kept file: into the one assets folder, then registered as an asset row (its kind) so it has an
 *  owner. */

import { exists, mkdir, readFile, remove, writeFile } from '@tauri-apps/plugin-fs';
import { appDataDir, join } from '@tauri-apps/api/path';
import { convertFileSrc } from '@tauri-apps/api/core';
import { StorageConfig } from '@config/storage.config';
import { store } from '@services/db';
import { blobToDataUrl } from '@shared/utils/file.utils';

export type AssetKind = (typeof StorageConfig.assetKinds)[number];

let appData: Promise<string> | undefined;
/** The app data folder, asked of the system once. */
const appDataPath = (): Promise<string> => (appData ??= appDataDir());

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

let folder: Promise<string> | undefined;

/** The assets folder on this device, created on first use. */
function assetsFolder(): Promise<string> {
  return (folder ??= (async () => {
    const dir = await join(await appDataPath(), StorageConfig.assetsDir);
    if (!(await exists(dir))) await mkdir(dir, { recursive: true });
    return dir;
  })());
}

/** Removes files a failed save wrote; what can't be removed is left for the store's sweep. */
async function discard(paths: string[]): Promise<void> {
  await Promise.all(paths.map((path) =>
    remove(path).catch((error: unknown) => console.warn('[assetsService] Left for the sweep:', path, error))));
}

export const assetsService = {
  /** Writes the file (and its preview) and registers it; on any failure removes what it wrote and throws. */
  async save(kind: AssetKind, file: AssetFile, options: SaveAssetOptions = {}): Promise<SavedAsset> {
    const dir = await assetsFolder();
    const folder = StorageConfig.assetsDir;
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

  /** The assets folder on this device (a recording's file is read there by name). */
  folder: assetsFolder,

  /** A kept file's bytes as a `data:` URL, for a model's file part; throws when the file is gone. */
  async dataUrl(appPath: string, mediaType: string): Promise<string> {
    const bytes = await readFile(await join(await appDataPath(), appPath));
    return blobToDataUrl(new Blob([bytes], { type: mediaType }));
  },

  /** A URL the webview loads for a file in app data, through Tauri's asset protocol (scoped to the assets folder). */
  async fileUrl(appPath: string): Promise<string> {
    return convertFileSrc(`${await appDataPath()}/${appPath}`);
  },
};
