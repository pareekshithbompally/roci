/** generate_image: the chat model writes the prompt; the image model chosen in Settings › Default Models draws it. */

import { z } from 'zod';
import type { ToolDefinition } from '@extensions/tools/types';
import { defineTool, ok, text } from '@extensions/tools/contract';
import { IMAGE_ASPECT_RATIOS, IMAGE_GENERATION_CONFIG } from '@config/imageGeneration.config';
import { generateImageFile } from '@services/ai/image';
import type { AppSettings } from '@shared/types';
import type { ModelProvider } from '@shared/types/modelProviders';

export const GENERATE_IMAGE_TOOL = 'generate_image';

/** The tool for one chat, bound to that chat's settings and providers (the image model and its key). */
export function generateImageTool(deps: { settings: AppSettings; providers: ModelProvider[] }): ToolDefinition {
  return defineTool({
    name: GENERATE_IMAGE_TOOL,
    description:
      'Create images from a text description, only when the user asks for one. Write a detailed visual prompt: subject, ' +
      'setting, style, lighting, composition and colours. One image per call unless the user asks for more. It appears ' +
      'in the chat on its own, so add at most one short line.',
    input: z.object({
      prompt: text('Detailed description of the image to create.'),
      aspect_ratio: z.enum(IMAGE_ASPECT_RATIOS).default(IMAGE_GENERATION_CONFIG.defaultAspectRatio).describe('Shape of the image.'),
    }),
    timeoutMs: IMAGE_GENERATION_CONFIG.timeoutMs,
    deferLoading: true,

    async execute({ prompt, aspect_ratio: aspectRatio }, context) {
      const image = await generateImageFile({
        prompt,
        aspectRatio,
        settings: deps.settings,
        providers: deps.providers,
        signal: context.signal,
        sessionId: context.sessionId,
      });
      // No file path for the model: it would echo it as a link. The image joins the reply right after this tool's row.
      return ok(
        `Created a ${aspectRatio} image with ${image.model}. It is already shown to the user in this reply, so don't link, embed or describe where it is saved.`,
        { image: { mediaType: image.mediaType, path: image.appPath, alt: prompt } },
      );
    },
  });
}
