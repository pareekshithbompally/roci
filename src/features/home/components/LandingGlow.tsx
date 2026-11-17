/**
 * Idle-view colour: one soft copper wash that flows down from the top of the screen (behind the phone's clear top bar)
 * and fades to the page by the middle, so the greeting sits on a calm ground. A single eased gradient (tokens.css
 * --gradient-idle-wash) under a faint dither: no shapes, no blur layers, no bands, the same on every window size.
 */

import React from 'react';

export const LandingGlow: React.FC = () => (
  // Starts above the view by the top bar and the status bar, so the wash runs behind them (a no-op on a Mac).
  <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 -top-[calc(var(--safe-top)+var(--top-bar-height))]">
    <div className="absolute inset-0 bg-idle-wash" />
    {/* Dither: breaks the gradient's 8-bit colour steps into a smooth blend. */}
    <div className="absolute inset-0 bg-dither opacity-dither mix-blend-overlay" />
  </div>
);
