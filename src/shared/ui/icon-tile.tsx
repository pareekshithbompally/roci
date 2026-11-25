import type React from 'react';
import { UI_CONFIG } from '@config/ui.config';
import { platform } from '@platform/index';
import { ICON_SIZE_PX, ICON_STROKE_WIDTH } from './icon';
import { STREAMING_CONFIG } from '@config/streaming.config';
import { useFormFactor } from '@platform/formFactor';

/** List icons (Settings rows, capabilities, usage): one icon step on every device, so a logo beside them (providers, models) matches. */
const LIST_ICON_PX = ICON_SIZE_PX.sm;
/** App-icon-shaped art in a list row (Settings panes, Mac apps, integrations, providers): Apple's size, larger than a glyph. */
export const LIST_ART_PX = platform.hasTouchScreen ? UI_CONFIG.listArt.touch : UI_CONFIG.listArt.desktop;
/** A line glyph (Lucide) or a Simple Icons brand mark, in currentColor. */
export type TileGlyph = React.ComponentType<{ size?: number | string; strokeWidth?: number | string; title?: string }>;

/** A one-colour mark file (`public/images/marks/`) as a glyph: drawn in currentColor at the glyph's size, like Lucide's. */
export function markGlyph(src: string): TileGlyph {
  const mask = `url("${src}") center / contain no-repeat`;
  const Mark: TileGlyph = ({ size = LIST_ICON_PX }) => (
    <span aria-hidden className="inline-block shrink-0" style={{ width: size, height: size, background: 'currentColor', mask, WebkitMask: mask }} />
  );
  return Mark;
}

/** A row icon is one of four things: a line glyph (`icon`), a Settings pane's own art (`image`), a model's or provider's logo
 *  tile (`logo`: a full square image in its brand's colours, rounded here), or a Mac app's icon (`app`, integrations). */
export type IconTileProps =
  | { icon: TileGlyph; image?: never; logo?: never; app?: never }
  | { image: string; icon?: never; logo?: never; app?: never }
  | { logo: string; size?: number; label?: string; working?: boolean; icon?: never; image?: never; app?: never }
  | { app: string; icon?: never; image?: never; logo?: never };

const { radius, workingRingPx } = UI_CONFIG.listArt;
const cornerOf = (size: number) => Math.round(size * radius);

/** While its model works: a light running round the tile's own rounded square, just outside it, so the tile never moves. */
function WorkingRing({ size }: { size: number }) {
  return (
    <span
      aria-hidden
      className="absolute overflow-hidden"
      style={{ inset: -workingRingPx, borderRadius: cornerOf(size) + workingRingPx }}
    >
      <span
        className="absolute animate-spin"
        style={{
          inset: '-50%',
          background: 'conic-gradient(from 0deg, transparent, var(--info-fg), var(--ai-accent), transparent)',
          animationDuration: `${STREAMING_CONFIG.LOADING_RING_DURATION_MS}ms`,
        }}
      />
    </span>
  );
}

/** A logo in the one tile: the image fills a rounded square at list-art size unless `size` says otherwise. */
function Logo({ logo, size = LIST_ART_PX, label, working }: { logo: string; size?: number; label?: string; working?: boolean }) {
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      {working && <WorkingRing size={size} />}
      <img
        src={logo}
        alt={label ?? ''}
        aria-hidden={label ? undefined : true}
        draggable={false}
        className="relative object-cover"
        style={{ width: size, height: size, borderRadius: cornerOf(size), boxShadow: 'inset 0 0 0 1px var(--logo-tile-edge)' }}
      />
    </span>
  );
}

/** A Mac app's icon: macOS draws its body inside padding, so the image is scaled until the body is the tile. */
function AppTile({ src }: { src: string }) {
  const drawn = Math.round(LIST_ART_PX / UI_CONFIG.appIconBody);
  return (
    <span aria-hidden className="inline-flex shrink-0 items-center justify-center" style={{ width: LIST_ART_PX, height: LIST_ART_PX }}>
      <img src={src} alt="" draggable={false} width={drawn} height={drawn} className="max-w-none shrink-0" />
    </span>
  );
}

/** A list row's icon. A logo tile or app icon at Apple's list-art size; a pane's art at that size; a line glyph in the text
 *  colour on a Mac only: a phone's second-level rows carry no icons (iOS Settings), so it draws nothing there. */
const isLogo = (props: IconTileProps): props is Extract<IconTileProps, { logo: string }> => props.logo !== undefined;

export function IconTile(props: IconTileProps) {
  const phone = useFormFactor() === 'phone';
  if (isLogo(props)) return <Logo logo={props.logo} size={props.size} label={props.label} working={props.working} />;
  if (props.app) return <AppTile src={props.app} />;
  if (props.image) return <img src={props.image} alt="" aria-hidden width={LIST_ART_PX} height={LIST_ART_PX} className="shrink-0" />;
  const Glyph = props.icon;
  if (!Glyph || phone) return null;
  return (
    <span aria-hidden className="inline-flex shrink-0 items-center justify-center text-primary">
      <Glyph size={LIST_ICON_PX} strokeWidth={ICON_STROKE_WIDTH} />
    </span>
  );
}
