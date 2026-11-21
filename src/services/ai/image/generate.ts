/** One image from the chosen image model (cloud or on this Mac), through the AI SDK, saved under app data; its usage is
 *  recorded like every model call. */

import { generateImage } from 'ai';
import type { ImageModel } from 'ai';
import { IMAGE_GENERATION_CONFIG } from '@config/imageGeneration.config';
import type { ImageAspectRatio, ImageSizing } from '@config/imageGeneration.config';
import { createImageModel } from '@services/ai/provider';
import { extractTokenUsage } from '@services/ai/types';
import { recordUsage } from '@extensions/usage';
import { imagesService } from '@services/storage';
import type { AppSettings } from '@shared/types';
import type { ModelProvider } from '@shared/types/modelProviders';
import { resolveImageModel } from './catalog';

export interface ImageRequest {
  prompt: string;
  aspectRatio: ImageAspectRatio;
  settings: AppSettings;
  providers: ModelProvider[];
  signal?: AbortSignal;
  /** The chat the image is for: its usage counts toward that chat. */
  sessionId?: string;
}

export interface GeneratedImageFile {
  /** Inside app data (`images/….png`): what a chat keeps. */
  appPath: string;
  /** On this device now. */
  path: string;
  mediaType: string;
  /** The model that made it, for the tool's reply. */
  model: string;
}

/** The image model to call, the image's shape in the form it takes, and its id for the reply. */
interface ImageTarget {
  model: ImageModel;
  shape: { size: `${number}x${number}` } | { aspectRatio: ImageAspectRatio };
  provider: string;
  modelId: string;
}

const ENGINES: Record<string, { sizing: ImageSizing }> = IMAGE_GENERATION_CONFIG.engines;

/** The chosen image model, with the shape in the form its provider takes. */
function imageTarget(request: ImageRequest): ImageTarget {
  const resolved = resolveImageModel(request.settings, request.providers);
  const shape = ENGINES[resolved.provider]?.sizing === 'size'
    ? { size: IMAGE_GENERATION_CONFIG.sizeByAspect[request.aspectRatio] }
    : { aspectRatio: request.aspectRatio };
  return { model: createImageModel(resolved), shape, provider: resolved.provider, modelId: resolved.modelId };
}

/** Generates one image with the chosen image model and writes it under app data; throws the user-facing reason. */
export async function generateImageFile(request: ImageRequest): Promise<GeneratedImageFile> {
  const target = imageTarget(request);
  const { image, usage } = await generateImage({
    model: target.model,
    prompt: request.prompt,
    n: 1,
    ...target.shape,
    abortSignal: request.signal,
  });
  recordUsage('image', { provider: target.provider, modelId: target.modelId }, extractTokenUsage(usage), request.sessionId);
  const { appPath, path } = await imagesService.saveImage(image.uint8Array, image.mediaType, {
    prompt: request.prompt,
    model: target.modelId,
    aspectRatio: request.aspectRatio,
  });
  return { appPath, path, mediaType: image.mediaType, model: target.modelId };
}
