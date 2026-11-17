/** Image models on this Mac: the local stable-diffusion.cpp server (Metal), reached through the AI SDK like cloud models. */

import { IMAGE_GENERATION_CONFIG } from '@config/imageGeneration.config';
import { createLocalImageModel } from '@services/ai/provider';
import { imageServerUrl } from '@services/localModels.service';
import type { LocalErrorPayload } from '@services/localModels.service';
import { errorMessage, isCodedError } from '@shared/utils/errors';
import type { ImageRequest, ImageTarget } from './generate';

function onDeviceImageErrorMessage(error: unknown, model: string): string {
  if (!isCodedError<LocalErrorPayload>(error)) return errorMessage(error);
  switch (error.code) {
    case 'not-downloaded': return `${model} isn't downloaded. Download it in Settings › Capabilities › Images.`;
    case 'unknown-model': return 'Choose an image model in Settings › Capabilities.';
    default: return `Couldn't start image generation on this Mac (${error.detail ?? error.code}).`;
  }
}

/** The chosen downloaded model, served locally (its server is started or woken here). */
export async function onDeviceImageTarget(request: ImageRequest): Promise<ImageTarget> {
  const { serverModelId, pixelsByAspect } = IMAGE_GENERATION_CONFIG.onDevice;
  const modelId = request.settings.imageModel ?? '';
  const [width, height] = pixelsByAspect[request.aspectRatio];
  try {
    const baseUrl = await imageServerUrl(modelId);
    return { model: createLocalImageModel(baseUrl, serverModelId), shape: { size: `${width}x${height}` }, modelId };
  } catch (error: unknown) {
    throw new Error(onDeviceImageErrorMessage(error, modelId), { cause: error });
  }
}
