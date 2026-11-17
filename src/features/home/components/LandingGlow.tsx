/**
 * Idle-view colour: a soft copper wash that flows down from the top of the screen (behind the phone's clear top bar)
 * and fades to the page by the middle, so the greeting sits on a calm, light ground. Solid shapes under a compositor
 * blur avoid WebKit gradient banding; the layer is still, so the blur is drawn once, not every frame.
 */

export const LandingGlow: React.FC = () => (
  // Starts above the view by the top bar and the status bar, so the wash runs behind them (a no-op on a Mac).
  <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 -top-[calc(var(--safe-top)+var(--top-bar-height))] overflow-hidden">
    {/* Oversized so the blur never reveals a hard edge at the clip bounds */}
    <div className="absolute -inset-[25%] blur-[110px]">
      {/* Copper wash — widest, across the top */}
      <div className="absolute left-1/2 top-[18%] h-[40rem] w-[60rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-glow-wash" />
      {/* Amber companion — top right */}
      <div className="absolute left-[66%] top-[16%] h-[24rem] w-[28rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-glow-companion" />
      {/* Copper core — top left, the warmest point, well above the greeting */}
      <div className="absolute left-[36%] top-[14%] h-[20rem] w-[24rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-glow-core" />
    </div>
  </div>
);
