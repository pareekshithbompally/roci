/** One image from the chosen image model (cloud or on this Mac), through the AI SDK, saved under app data. */

import { generateImage } from 'ai';
import type { ImageModel } from 'ai';
import { IMAGE_GENERATION_CONFIG } from '@config/imageGeneration.config';
import type { ImageAspectRatio, ImageSizing } from '@config/imageGeneration.config';
import { createImageModel } from '@services/ai/provider';
import { imagesService } from '@services/storage';
import type { AppSettings } from '@shared/types';
import type { ModelProvider } from '@shared/types/modelProviders';
import { resolveImageModel } from './catalog';
import { onDeviceImageTarget } from './onDevice';

export interface ImageRequest {
  prompt: string;
  aspectRatio: ImageAspectRatio;
  settings: AppSettings;
  providers: ModelProvider[];
  signal?: AbortSignal;
}

export interface GeneratedImageFile {
  path: string;
  mediaType: string;
  /** The model that made it, for the tool's reply. */
  model: string;
}

/** The image model to call, the image's shape in the form it takes, and its id for the reply. */
export interface ImageTarget {
  model: ImageModel;
  shape: { size: `${number}x${number}` } | { aspectRatio: ImageAspectRatio };
  modelId: string;
}

const ENGINES: Record<string, { sizing: ImageSizing }> = IMAGE_GENERATION_CONFIG.engines;

/** A cloud image model, with the shape in the form its provider takes. */
async function cloudImageTarget(request: ImageRequest): Promise<ImageTarget> {
  const resolved = resolveImageModel(request.settings, request.providers);
  const shape = ENGINES[resolved.provider]?.sizing === 'size'
    ? { size: IMAGE_GENERATION_CONFIG.sizeByAspect[request.aspectRatio] }
    : { aspectRatio: request.aspectRatio };
  return { model: createImageModel(resolved), shape, modelId: resolved.modelId };
}

/** Image targets by provider; any other provider is a cloud image model. */
const TARGETS: Record<string, (request: ImageRequest) => Promise<ImageTarget>> = {
  [IMAGE_GENERATION_CONFIG.onDevice.provider]: onDeviceImageTarget,
};

/** Generates one image with the chosen image model and writes it under app data; throws the user-facing reason. */
export async function generateImageFile(request: ImageRequest): Promise<GeneratedImageFile> {
  const target = await (TARGETS[request.settings.imageProvider ?? ''] ?? cloudImageTarget)(request);
  const { image } = await generateImage({
    model: target.model,
    prompt: request.prompt,
    n: 1,
    ...target.shape,
    abortSignal: request.signal,
  });
  const path = await imagesService.saveImage(image.uint8Array, image.mediaType);
  return { path, mediaType: image.mediaType, model: target.modelId };
}
