/** Image generation: the image models Settings › Capabilities offers, the shapes the tool accepts, and its limits. */

import { LOCAL_MODELS_CONFIG } from '@config/localModels.config';

/** How a provider takes the image's shape: an aspect ratio, or a fixed pixel size. */
export type ImageSizing = 'aspectRatio' | 'size';

export interface ImageEngine {
  sizing: ImageSizing;
  models: ReadonlyArray<{ id: string; label: string }>;
}

export const IMAGE_ASPECT_RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4'] as const;
export type ImageAspectRatio = (typeof IMAGE_ASPECT_RATIOS)[number];

export const IMAGE_GENERATION_CONFIG = {
  /** Image models by provider id; adding a model is one entry. */
  engines: {
    openai: {
      sizing: 'size',
      models: [
        { id: 'gpt-image-1.5', label: 'GPT Image 1.5' },
        { id: 'gpt-image-1-mini', label: 'GPT Image 1 mini' },
      ],
    },
    gemini: {
      sizing: 'aspectRatio',
      models: [
        { id: 'gemini-2.5-flash-image', label: 'Gemini 2.5 Flash Image' },
        { id: 'gemini-3-pro-image-preview', label: 'Gemini 3 Pro Image' },
      ],
    },
  } satisfies Record<string, ImageEngine>,
  /** Pixel sizes for providers that take a size: the closest size they support to each shape. */
  sizeByAspect: {
    '1:1': '1024x1024',
    '16:9': '1536x1024',
    '4:3': '1536x1024',
    '9:16': '1024x1536',
    '3:4': '1024x1536',
  } satisfies Record<ImageAspectRatio, `${number}x${number}`>,
  /** Image models downloaded to this Mac (stable-diffusion.cpp on Metal): their provider id and pixel size per shape. */
  onDevice: {
    provider: LOCAL_MODELS_CONFIG.provider.id,
    /** The one model id stable-diffusion.cpp's server answers to on its OpenAI API. */
    serverModelId: 'sd-cpp-local',
    pixelsByAspect: {
      '1:1': [1024, 1024],
      '16:9': [1344, 768],
      '9:16': [768, 1344],
      '4:3': [1152, 896],
      '3:4': [896, 1152],
    } satisfies Record<ImageAspectRatio, readonly [number, number]>,
  },
  defaultAspectRatio: '1:1' as ImageAspectRatio,
  /** Image models take 10–60 s; the tool's own limit replaces the default tool timeout. */
  timeoutMs: 120_000,
  /** File extension per returned media type. */
  extensionByMediaType: {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
  } as Record<string, string>,
  defaultExtension: 'png',
  /** The Capabilities picker's "Off" row. */
  off: { value: 'off', label: 'Off' },
} as const;
