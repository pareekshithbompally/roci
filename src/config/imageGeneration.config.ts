/** Image generation: the image models Settings › Default Models offers, the shapes the tool accepts, and its limits. */

/** How a provider takes the image's shape: an aspect ratio, or a fixed pixel size. */
export type ImageSizing = 'aspectRatio' | 'size';

/** A provider Roci makes images with, and how it takes the image's shape; its models come from the model spine. */
export interface ImageEngine {
  sizing: ImageSizing;
}

export const IMAGE_ASPECT_RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4'] as const;
export type ImageAspectRatio = (typeof IMAGE_ASPECT_RATIOS)[number];

export const IMAGE_GENERATION_CONFIG = {
  /** Providers whose image API the AI SDK drives (`createImageModel`); its models are the ones the user added. */
  engines: {
    openai: { sizing: 'size' },
    gemini: { sizing: 'aspectRatio' },
  } satisfies Record<string, ImageEngine>,
  /** Pixel sizes for providers that take a size: the closest size they support to each shape. */
  sizeByAspect: {
    '1:1': '1024x1024',
    '16:9': '1536x1024',
    '4:3': '1536x1024',
    '9:16': '1024x1536',
    '3:4': '1024x1536',
  } satisfies Record<ImageAspectRatio, `${number}x${number}`>,
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
  /** The Default Models picker's "Off" row. */
  off: { value: 'off', label: 'Off' },
} as const;
