/**
 * LandingGlow Component
 *
 * Ambient background for the idle landing view — Gemini-style colour field.
 *
 * Three solid-colour blobs drift slowly inside a heavily blurred container.
 * The soft falloff comes from the compositor's Gaussian blur (evaluated in
 * float at composite time) instead of a painted alpha gradient, which
 * WebKit (WKWebView on macOS) rasterizes into 8-bit channels with visible
 * contour banding. Solid layers + `transform` keyframes are how production
 * implementations (Google's Gemini pages, Linear-style auroras) do it.
 *
 * Layout contract: this layer is deliberately layout-agnostic (`inset-0`
 * of its parent). Views run to the window top, so IdleView's full-bleed
 * box puts the glow under the titlebar; its `TitlebarSpacer` keeps the flow
 * content below it.
 * Don't add offsets here to chase layout metrics.
 *
 * Drift keyframes live in tailwind.config.js (`glow-drift-*`) and only run
 * under `motion-safe:`, honouring prefers-reduced-motion. The `left`/`top`
 * percentages denote each blob's CENTRE (centred via `-translate-*` and the
 * matching translate baked into the keyframes) — never the top-left corner.
 */

interface LandingGlowProps {
  /** Freeze the drift (e.g. while the voice pill owns the composer) so the
      swap animates against a still frame instead of fighting repaints. */
  paused?: boolean;
}

export const LandingGlow: React.FC<LandingGlowProps> = ({ paused = false }) => (
  <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
    {/* Oversized so the blur never reveals a hard edge at the clip bounds */}
    <div className="absolute -inset-[25%] blur-[110px]">
      {/* Indigo ambient wash — widest, slowest */}
      <div className={`absolute left-[45%] top-[40%] h-[42rem] w-[42rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-400/25 motion-safe:animate-glow-drift-3 dark:bg-indigo-500/30 ${paused ? '[animation-play-state:paused]' : ''}`} />
      {/* Violet companion — offset right-down from the core */}
      <div className={`absolute left-[56%] top-[44%] h-[30rem] w-[30rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-400/35 motion-safe:animate-glow-drift-2 dark:bg-violet-500/40 ${paused ? '[animation-play-state:paused]' : ''}`} />
      {/* Blue core — peaks just above the composer, centred on the text column */}
      <div className={`absolute left-1/2 top-[42%] h-[24rem] w-[24rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-400/45 motion-safe:animate-glow-drift-1 dark:bg-blue-500/45 ${paused ? '[animation-play-state:paused]' : ''}`} />
    </div>
  </div>
);
