/** Idle-view colour field: solid blobs under a compositor blur, avoiding WebKit gradient banding. */

interface LandingGlowProps {
  /** Freeze the drift so the voice-pill swap animates against a still frame. */
  paused?: boolean;
}

export const LandingGlow: React.FC<LandingGlowProps> = ({ paused = false }) => (
  <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
    {/* Oversized so the blur never reveals a hard edge at the clip bounds */}
    <div className="absolute -inset-[25%] blur-[110px]">
      {/* Copper wash — widest, slowest */}
      <div className={`absolute left-[45%] top-[40%] h-[42rem] w-[42rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-glow-wash motion-safe:animate-glow-drift-3 ${paused ? '[animation-play-state:paused]' : ''}`} />
      {/* Amber companion — offset right-down from the core */}
      <div className={`absolute left-[56%] top-[44%] h-[30rem] w-[30rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-glow-companion motion-safe:animate-glow-drift-2 ${paused ? '[animation-play-state:paused]' : ''}`} />
      {/* Copper core — peaks just above the composer, centred on the text column */}
      <div className={`absolute left-1/2 top-[42%] h-[24rem] w-[24rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-glow-core motion-safe:animate-glow-drift-1 ${paused ? '[animation-play-state:paused]' : ''}`} />
    </div>
  </div>
);
