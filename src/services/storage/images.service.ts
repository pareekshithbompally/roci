/** Generated images on disk (`images/{uuid}.{ext}` under app data); chats keep only their paths. */

import { writeFile, exists, mkdir } from '@tauri-apps/plugin-fs';
import { appDataDir, join } from '@tauri-apps/api/path';
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

export const imagesService = {
  /** Writes a generated image and returns its absolute path; throws when it can't. */
  async saveImage(data: Uint8Array, mediaType: string): Promise<string> {
    const path = await join(await imagesDir(), `${crypto.randomUUID()}.${extensionOf(mediaType)}`);
    await writeFile(path, data);
    return path;
  },
};
