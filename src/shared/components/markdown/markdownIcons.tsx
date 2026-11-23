/** Streamdown's control icons (a code block's Copy and Download, a diagram's zoom) drawn as the app's own: Lucide at the
 *  kit's action size and stroke, whatever size Streamdown asks for. */

import type { IconMap } from 'streamdown';
import type { LucideIcon } from 'lucide-react';
import { Check, Copy, Download, ExternalLink, Loader2, Maximize2, RotateCcw, X, ZoomIn, ZoomOut } from 'lucide-react';
import { ICON_SIZE_PX, ICON_STROKE_WIDTH } from '@shared/ui';

function kitGlyph(Glyph: LucideIcon): IconMap[keyof IconMap] {
  return function KitGlyph({ size: _size, ...props }) {
    return <Glyph {...props} size={ICON_SIZE_PX.sm} strokeWidth={ICON_STROKE_WIDTH} />;
  };
}

export const MARKDOWN_ICONS: IconMap = {
  CheckIcon: kitGlyph(Check),
  CopyIcon: kitGlyph(Copy),
  DownloadIcon: kitGlyph(Download),
  ExternalLinkIcon: kitGlyph(ExternalLink),
  Loader2Icon: kitGlyph(Loader2),
  Maximize2Icon: kitGlyph(Maximize2),
  RotateCcwIcon: kitGlyph(RotateCcw),
  XIcon: kitGlyph(X),
  ZoomInIcon: kitGlyph(ZoomIn),
  ZoomOutIcon: kitGlyph(ZoomOut),
};
