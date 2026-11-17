/** Generated images on disk (`images/{uuid}.{ext}` under app data, each with a `{uuid}.json` of its details); chats keep
 *  only the image's path inside app data; the gallery reads the folder. */

import { exists, mkdir, readDir, readTextFile, writeFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { appDataDir, join } from '@tauri-apps/api/path';
import { convertFileSrc } from '@tauri-apps/api/core';
import { StorageConfig } from '@config/storage.config';
import { IMAGE_GENERATION_CONFIG } from '@config/imageGeneration.config';
import { queryClient } from '@shared/query/queryClient';
import { queryKeys } from '@shared/query/queryKeys';

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

/** What an image records about itself, beside it on disk. */
export interface ImageDetails {
  prompt: string;
  model: string;
  aspectRatio: string;
  /** Epoch ms. */
  createdAt: number;
  /** The chat that made it, to open it from the gallery. */
  sessionId?: string;
}

/** One gallery entry: the image (app path and a URL the webview loads) and its details (absent for older images). */
export interface GalleryImage {
  appPath: string;
  url: string;
  details: ImageDetails | null;
}

const IMAGE_EXTENSIONS = new Set(Object.values(IMAGE_GENERATION_CONFIG.extensionByMediaType).concat(IMAGE_GENERATION_CONFIG.defaultExtension));

async function readDetails(dir: string, stem: string): Promise<ImageDetails | null> {
  try {
    return JSON.parse(await readTextFile(await join(dir, `${stem}.json`))) as ImageDetails;
  } catch {
    return null; // made before details were kept
  }
}

export const imagesService = {
  /** Writes a generated image and its details; throws when it can't. The gallery refreshes. */
  async saveImage(data: Uint8Array, mediaType: string, details: ImageDetails): Promise<SavedImage> {
    const dir = await imagesDir();
    const stem = crypto.randomUUID();
    const name = `${stem}.${extensionOf(mediaType)}`;
    const path = await join(dir, name);
    await writeFile(path, data);
    await writeTextFile(await join(dir, `${stem}.json`), JSON.stringify(details));
    void queryClient.invalidateQueries({ queryKey: queryKeys.gallery() });
    return { appPath: `${StorageConfig.directories.images}/${name}`, path };
  },

  /** Every generated image, newest first (older ones without details last). */
  async listImages(): Promise<GalleryImage[]> {
    const dir = await imagesDir();
    const files = (await readDir(dir)).filter((entry) => entry.isFile && IMAGE_EXTENSIONS.has(entry.name.split('.').pop() ?? ''));
    const images = await Promise.all(files.map(async ({ name }) => {
      const appPath = `${StorageConfig.directories.images}/${name}`;
      return { appPath, url: convertFileSrc(await join(dir, name)), details: await readDetails(dir, name.replace(/\.[^.]+$/, '')) };
    }));
    return images.sort((a, b) => (b.details?.createdAt ?? 0) - (a.details?.createdAt ?? 0));
  },

  /** A URL the webview loads for a file in app data, through Tauri's asset protocol (scoped to images in tauri.conf.json). */
  async fileUrl(appPath: string): Promise<string> {
    return convertFileSrc(await join(await appDataDir(), appPath));
  },
};
