/** generate_image: the chat model writes the prompt; the image model chosen in Settings › Default Models draws it. */

import type { ToolDefinition, ToolResult } from '@extensions/tools/types';
import { IMAGE_ASPECT_RATIOS, IMAGE_GENERATION_CONFIG } from '@config/imageGeneration.config';
import type { ImageAspectRatio } from '@config/imageGeneration.config';
import { generateImageFile } from '@services/ai/image';
import type { AppSettings } from '@shared/types';
import type { ModelProvider } from '@shared/types/modelProviders';

export const GENERATE_IMAGE_TOOL = 'generate_image';

function aspectRatioOf(value: unknown): ImageAspectRatio {
  return IMAGE_ASPECT_RATIOS.find((r) => r === value) ?? IMAGE_GENERATION_CONFIG.defaultAspectRatio;
}

/** The tool for one chat, bound to that chat's settings and providers (the image model and its key). */
export function generateImageTool(deps: { settings: AppSettings; providers: ModelProvider[] }): ToolDefinition {
  return {
    name: GENERATE_IMAGE_TOOL,
    description:
      'Create one image from a text description and show it to the user. Write a detailed visual prompt: subject, ' +
      'setting, style, lighting, composition and colours. Make one image per call unless the user asks for more. ' +
      'The image is shown in the chat, so describe what you made briefly instead of repeating the prompt.',
    parameters: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Detailed description of the image to create.' },
        aspect_ratio: {
          type: 'string',
          description: 'Shape of the image.',
          enum: [...IMAGE_ASPECT_RATIOS],
          default: IMAGE_GENERATION_CONFIG.defaultAspectRatio,
        },
      },
      required: ['prompt'],
    },
    timeoutMs: IMAGE_GENERATION_CONFIG.timeoutMs,

    async execute(params, context): Promise<ToolResult> {
      const aspectRatio = aspectRatioOf(params.aspect_ratio);
      const image = await generateImageFile({
        prompt: params.prompt as string,
        aspectRatio,
        settings: deps.settings,
        providers: deps.providers,
        signal: context.signal,
      });
      return {
        toolCallId: '',
        content: `Created a ${aspectRatio} image with ${image.model}. It is shown to the user and saved at ${image.path}.`,
        isError: false,
        // The image itself joins the reply as an image part, right after this tool's row.
        meta: {
          toolName: GENERATE_IMAGE_TOOL,
          executionMs: 0,
          image: { type: 'image', mimeType: image.mediaType, source: { kind: 'file', path: image.appPath }, alt: params.prompt as string },
        },
      };
    },
  };
}
