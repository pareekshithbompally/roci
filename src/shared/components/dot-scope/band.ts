/**
 * Composer band geometry — the takeover-lite variant of the plate for the
 * chat composer's text slot.
 *
 * While recording, the plate stretches across the slot: a per-capture tuning
 * widens `width` and grows `columns` so the dot pitch stays Hex's spacing and
 * the simulation (braid, flow, wipes) runs unchanged, just on a longer
 * instrument. While transcribing it contracts to Hex's processing pill,
 * centred. Geometry is frozen at capture start so nothing resizes mid-take.
 */

import { DOT_SCOPE_CONFIG } from '@config/dotScope.config';
import type { DotScopeTuning } from '@config/dotScope.config';

export interface BandGeometry {
  /** Slot-fitting canvas box, CSS px — the plate sits centred inside it. */
  width: number;
  height: number;
  /** Whole-pill zoom (plateHeight over Hex's 26 pt plate). */
  zoom: number;
  /** Per-capture tuning: band width and column count, everything else Hex's. */
  tuning: DotScopeTuning;
}

/** Canvas width while transcribing, CSS px: the pill plus its shadow margins. */
export function bandPillWidth(zoom: number): number {
  return (
    (DOT_SCOPE_CONFIG.tuning.processingWidth + 2 * DOT_SCOPE_CONFIG.canvasMargin.x) *
    zoom
  );
}

/** Builds the band for a measured text-slot width (CSS px). */
export function buildBand(slotWidth: number): BandGeometry {
  const { tuning, canvasMargin, composerBand } = DOT_SCOPE_CONFIG;
  const zoom = composerBand.plateHeight / tuning.height;
  // The plate spans the slot minus the canvas shadow margins, and never gets
  // narrower than the processing pill it contracts into.
  const width = Math.max(
    slotWidth / zoom - 2 * canvasMargin.x,
    tuning.processingWidth,
  );
  // Columns follow the band so the pitch stays Hex's; odd keeps a centre column.
  const columns = Math.max(
    tuning.columns,
    Math.round((width + tuning.spacing) / tuning.spacing) | 1,
  );
  return {
    width: slotWidth,
    height: (tuning.height + 2 * canvasMargin.y) * zoom,
    zoom,
    tuning: { ...tuning, width, columns },
  };
}
