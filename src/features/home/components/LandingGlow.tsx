/**
 * Idle-view colour: a soft copper glow at the top of the screen (behind the phone's clear top bar), fading to the page
 * by the middle. Solid shapes under one compositor blur avoid WebKit gradient banding. The three overlap around one
 * centre (the original geometry), so the blur fuses them into a single glow; only the group's height places it at the
 * top. The layer is still, so the blur is drawn once.
 */

import React from 'react';

export const LandingGlow: React.FC = () => (
  // Starts above the view by the top bar and the status bar, so the glow runs behind them (a no-op on a Mac).
  <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 -top-[calc(var(--safe-top)+var(--top-bar-height))] overflow-hidden">
    {/* Oversized so the blur never reveals a hard edge at the clip bounds */}
    <div className="absolute -inset-[25%] blur-[110px]">
      {/* Copper wash — widest */}
      <div className="absolute left-[45%] top-[15%] h-[42rem] w-[42rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-glow-wash" />
      {/* Amber companion — offset right-down from the core */}
      <div className="absolute left-[56%] top-[19%] h-[30rem] w-[30rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-glow-companion" />
      {/* Copper core — the centre the other two overlap */}
      <div className="absolute left-1/2 top-[17%] h-[24rem] w-[24rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-glow-core" />
    </div>
  </div>
);
