/** Idle-view colour field: solid blobs under a compositor blur, avoiding WebKit gradient banding. */

interface LandingGlowProps {
  /** Freeze the drift so the voice-pill swap animates against a still frame. */
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
