/**
 * Idle-view colour: a soft copper wash behind the greeting, fading to the page well before the top bar, so the bar's
 * controls sit on the plain page and the greeting on a calm, light ground. Solid blobs under a compositor
 * blur avoid WebKit gradient banding.
 */

interface LandingGlowProps {
  /** Freeze the drift so the voice-pill swap animates against a still frame. */
  paused?: boolean;
}

export const LandingGlow: React.FC<LandingGlowProps> = ({ paused = false }) => {
  const drift = paused ? '[animation-play-state:paused]' : '';
  return (
    // Starts above the view by the top bar and the status bar, so the wash runs behind them (a no-op on a Mac).
    <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 -top-[calc(var(--safe-top)+var(--top-bar-height))] overflow-hidden">
      {/* Oversized so the blur never reveals a hard edge at the clip bounds */}
      <div className="absolute -inset-[25%] blur-[110px]">
        {/* Copper wash — widest, across the top */}
        <div className={`absolute left-1/2 top-[46%] h-[40rem] w-[60rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-glow-wash motion-safe:animate-glow-drift-3 ${drift}`} />
        {/* Amber companion — top right */}
        <div className={`absolute left-[66%] top-[42%] h-[24rem] w-[28rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-glow-companion motion-safe:animate-glow-drift-2 ${drift}`} />
        {/* Copper core — top left, the warmest point, well above the greeting */}
        <div className={`absolute left-[36%] top-[40%] h-[20rem] w-[24rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-glow-core motion-safe:animate-glow-drift-1 ${drift}`} />
      </div>
    </div>
  );
};
