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
export function generateImageTool(deps: { settings: AppSettings; providers: ModelProvider[]; sessionId?: string }): ToolDefinition {
  return defineTool({
    name: GENERATE_IMAGE_TOOL,
    description:
      'Create one image from a text description and show it to the user. Write a detailed visual prompt: subject, ' +
      'setting, style, lighting, composition and colours. Make one image per call unless the user asks for more. ' +
      'The image is shown in the chat, so describe what you made briefly instead of repeating the prompt.',
    input: z.object({
      prompt: text('Detailed description of the image to create.'),
      aspect_ratio: z.enum(IMAGE_ASPECT_RATIOS).default(IMAGE_GENERATION_CONFIG.defaultAspectRatio).describe('Shape of the image.'),
    }),
    timeoutMs: IMAGE_GENERATION_CONFIG.timeoutMs,

    async execute({ prompt, aspect_ratio: aspectRatio }, context) {
      const image = await generateImageFile({
        prompt,
        aspectRatio,
        settings: deps.settings,
        providers: deps.providers,
        signal: context.signal,
        sessionId: deps.sessionId,
      });
      // No file path for the model: it would echo it as a link. The image joins the reply right after this tool's row.
      return ok(
        `Created a ${aspectRatio} image with ${image.model}. It is already shown to the user in this reply, so don't link, embed or describe where it is saved.`,
        { image: { type: 'image', mimeType: image.mediaType, source: { kind: 'file', path: image.appPath }, alt: prompt } },
      );
    },
  });
}
