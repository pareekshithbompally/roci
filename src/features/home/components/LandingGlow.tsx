/**
 * Idle-view colour: a soft copper halo centred on the mark and greeting (it sits inside their block), fading to the plain
 * page well before the edges, so the bar and composer sit on the page. Solid blobs under a compositor blur avoid WebKit
 * gradient banding; the view clips what spills past it.
 */

interface LandingGlowProps {
  /** Freeze the drift so the voice-pill swap animates against a still frame. */
  paused?: boolean;
}

export const LandingGlow: React.FC<LandingGlowProps> = ({ paused = false }) => {
  const drift = paused ? '[animation-play-state:paused]' : '';
  return (
    <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[22rem] w-[22rem] -translate-x-1/2 -translate-y-1/2 blur-[56px]">
      {/* Copper wash — the halo's body */}
      <div className={`absolute left-1/2 top-1/2 h-[12rem] w-[13rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-glow-wash motion-safe:animate-glow-drift-3 ${drift}`} />
      {/* Amber companion — a little right */}
      <div className={`absolute left-[60%] top-[46%] h-[7rem] w-[8rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-glow-companion motion-safe:animate-glow-drift-2 ${drift}`} />
      {/* Copper core — behind the mark, the warmest point */}
      <div className={`absolute left-[44%] top-[44%] h-[6rem] w-[7rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-glow-core motion-safe:animate-glow-drift-1 ${drift}`} />
    </div>
  );
};
