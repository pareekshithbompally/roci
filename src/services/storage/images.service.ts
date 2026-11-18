/** Generated images in the asset store (`images/`), with a thumbnail each; chats keep only the image's app path, the gallery reads the folder. */

import { readDir, writeFile } from '@tauri-apps/plugin-fs';
import { join } from '@tauri-apps/api/path';
import { StorageConfig } from '@config/storage.config';
import { assetDir, assetsService } from './assets.service';
import { IMAGE_GENERATION_CONFIG } from '@config/imageGeneration.config';
import { GALLERY_CONFIG } from '@config/gallery.config';
import { queryClient } from '@shared/query/queryClient';
import { queryKeys } from '@shared/query/queryKeys';

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

/** One gallery entry: the image (app path, full-size and thumbnail URLs) and its details (absent for older images). */
export interface GalleryImage {
  appPath: string;
  url: string;
  /** The small copy the grid shows; the full image when an older one has none. */
  thumbUrl: string;
  details: ImageDetails | null;
}

const THUMB_SUFFIX = '.thumb.jpg';

/** A downscaled JPEG of the image (longest side GALLERY_CONFIG.thumbnail.maxPx), so a grid needn't decode full PNGs. */
async function thumbnailOf(data: Uint8Array, mediaType: string): Promise<Uint8Array> {
  const { maxPx, quality } = GALLERY_CONFIG.thumbnail;
  const bitmap = await createImageBitmap(new Blob([data], { type: mediaType }));
  const scale = Math.min(1, maxPx / Math.max(bitmap.width, bitmap.height));
  const canvas = new OffscreenCanvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale));
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Uint8Array(await (await canvas.convertToBlob({ type: 'image/jpeg', quality })).arrayBuffer());
}

const IMAGE_EXTENSIONS = new Set(Object.values(IMAGE_GENERATION_CONFIG.extensionByMediaType).concat(IMAGE_GENERATION_CONFIG.defaultExtension));

const isImageDetails = (details: Partial<ImageDetails>) => typeof details.createdAt === 'number' && typeof details.prompt === 'string';

export const imagesService = {
  /** Writes a generated image and its details; throws when it can't. The gallery refreshes. */
  async saveImage(data: Uint8Array, mediaType: string, details: ImageDetails): Promise<SavedImage> {
    const { appPath, path, dir, stem } = await assetsService.save('images', data, extensionOf(mediaType), details);
    // The thumbnail is a convenience: an image without one shows at full size.
    await thumbnailOf(data, mediaType)
      .then(async (thumb) => writeFile(await join(dir, `${stem}${THUMB_SUFFIX}`), thumb))
      .catch((error: unknown) => console.warn('[imagesService] thumbnail failed:', error));
    void queryClient.invalidateQueries({ queryKey: queryKeys.gallery() });
    return { appPath, path };
  },

  /** Every generated image, newest first (older ones without details last). */
  async listImages(): Promise<GalleryImage[]> {
    const dir = await assetDir('images');
    const entries = await readDir(dir);
    const names = new Set(entries.map((entry) => entry.name));
    const files = entries.filter((entry) =>
      entry.isFile && !entry.name.endsWith(THUMB_SUFFIX) && IMAGE_EXTENSIONS.has(entry.name.split('.').pop() ?? ''));
    const images = await Promise.all(files.map(async ({ name }) => {
      const stem = name.replace(/\.[^.]+$/, '');
      const appPath = `${StorageConfig.directories.images}/${name}`;
      const url = await assetsService.fileUrl(appPath);
      const thumbName = `${stem}${THUMB_SUFFIX}`;
      const thumbUrl = names.has(thumbName) ? await assetsService.fileUrl(`${StorageConfig.directories.images}/${thumbName}`) : url;
      return { appPath, url, thumbUrl, details: await assetsService.readDetails<ImageDetails>(dir, stem, isImageDetails) };
    }));
    return images.sort((a, b) => (b.details?.createdAt ?? 0) - (a.details?.createdAt ?? 0));
  },
};
