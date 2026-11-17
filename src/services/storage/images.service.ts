/** Generated images on disk (`images/{uuid}.{ext}` under app data); chats keep only their path inside app data. */

import { writeFile, exists, mkdir } from '@tauri-apps/plugin-fs';
import { appDataDir, join } from '@tauri-apps/api/path';
import { convertFileSrc } from '@tauri-apps/api/core';
import { StorageConfig } from '@config/storage.config';
import { IMAGE_GENERATION_CONFIG } from '@config/imageGeneration.config';

let imagesDirPromise: Promise<string> | null = null;

async function imagesDir(): Promise<string> {
  imagesDirPromise ??= (async () => {
    const dir = await join(await appDataDir(), StorageConfig.directories.images);
    if (!(await exists(dir))) await mkdir(dir, { recursive: true });
    return dir;
  })();
  return imagesDirPromise;
}

function extensionOf(mediaType: string): string {
  return IMAGE_GENERATION_CONFIG.extensionByMediaType[mediaType] ?? IMAGE_GENERATION_CONFIG.defaultExtension;
}

/** Where an image lives: inside app data (what chats keep) and on this device now. */
export interface SavedImage {
  appPath: string;
  path: string;
}

export const imagesService = {
  /** Writes a generated image; throws when it can't. */
  async saveImage(data: Uint8Array, mediaType: string): Promise<SavedImage> {
    const name = `${crypto.randomUUID()}.${extensionOf(mediaType)}`;
    const path = await join(await imagesDir(), name);
    await writeFile(path, data);
    return { appPath: `${StorageConfig.directories.images}/${name}`, path };
  },

  /** A URL the webview loads for a file in app data, through Tauri's asset protocol (scoped to images in tauri.conf.json). */
  async fileUrl(appPath: string): Promise<string> {
    return convertFileSrc(await join(await appDataDir(), appPath));
  },
};
