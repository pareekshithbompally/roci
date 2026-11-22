/** Generated images: each an asset row (kind `image`) with a thumbnail; chats keep the image's app path, the gallery reads the rows. */

import { IMAGE_GENERATION_CONFIG } from '@config/imageGeneration.config';
import { GALLERY_CONFIG } from '@config/gallery.config';
import { queryClient } from '@shared/query/queryClient';
import { queryKeys } from '@shared/query/queryKeys';
import { store, type ItemCursor } from '@services/db';
import type { AssetRow } from '@shared/types/native';
import { assetsService, type SavedAsset } from './assets.service';

function extensionOf(mediaType: string): string {
  return IMAGE_GENERATION_CONFIG.extensionByMediaType[mediaType] ?? IMAGE_GENERATION_CONFIG.defaultExtension;
}

/** What an image records about itself. */
export interface ImageMeta {
  prompt: string;
  provider: string;
  model: string;
  aspectRatio: string;
}

/** One gallery entry: the image (app path, full-size and thumbnail URLs), when it was made, its chat, and its meta. */
export interface GalleryImage {
  id: string;
  appPath: string;
  url: string;
  /** The small copy the grid shows; the full image when it has none. */
  thumbUrl: string;
  /** Epoch ms. */
  createdAt: number;
  /** The chat that shows it, to open it from the gallery. */
  chatId: string | null;
  /** Absent for images made before images recorded it. */
  meta: ImageMeta | null;
}

const THUMB_EXTENSION = 'thumb.jpg';

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

function metaOf(row: AssetRow): ImageMeta | null {
  try {
    return row.meta ? (JSON.parse(row.meta) as ImageMeta) : null;
  } catch {
    return null;
  }
}

async function toGalleryImage(row: AssetRow): Promise<GalleryImage> {
  const url = await assetsService.fileUrl(row.path);
  const thumbUrl = row.preview_path ? await assetsService.fileUrl(row.preview_path) : url;
  return { id: row.id, appPath: row.path, url, thumbUrl, createdAt: row.created_at, chatId: row.chat_id, meta: metaOf(row) };
}

export const imagesService = {
  /** Saves a generated image with its thumbnail; throws when it can't. The gallery refreshes. */
  async saveImage(data: Uint8Array, mediaType: string, meta: ImageMeta): Promise<SavedAsset> {
    // The thumbnail is a convenience: an image without one shows at full size.
    const preview = await thumbnailOf(data, mediaType)
      .then((thumb) => ({ data: thumb, extension: THUMB_EXTENSION }))
      .catch((error: unknown) => {
        console.warn('[imagesService] thumbnail failed:', error);
        return undefined;
      });
    const saved = await assetsService.save('image', { data, extension: extensionOf(mediaType) }, { preview, meta });
    void queryClient.invalidateQueries({ queryKey: queryKeys.gallery() });
    return saved;
  },

  /** One page of generated images, newest first, after `before`. */
  async imagesPage(before: ItemCursor | null, limit: number): Promise<GalleryImage[]> {
    return Promise.all((await store.assets.page('image', before, limit)).map(toGalleryImage));
  },
};
