/**
 * Startup splash — the logo index.html paints before JS loads (styles in
 * src/styles/splash.css). Raised above the app as soon as JS runs, then faded
 * out and removed once the app has its first real screen.
 */

import { ANIMATION_CONFIG } from '@config/animations.config';
import { UI_CONFIG } from '@config/ui.config';

const SPLASH_ID = 'splash';

/** Keep the splash above the app's own layers while React mounts underneath it. */
export function raiseSplash(): void {
  const splash = document.getElementById(SPLASH_ID);
  if (splash) splash.style.zIndex = String(UI_CONFIG.zIndex.splash);
}

/** Fade the splash out and remove it. Safe to call more than once. */
export function dismissSplash(): void {
  const splash = document.getElementById(SPLASH_ID);
  if (!splash || splash.dataset.dismissed) return;
  splash.dataset.dismissed = 'true';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const { duration, easing } = ANIMATION_CONFIG.transition.opacity;
  const fade = splash.animate([{ opacity: 1 }, { opacity: 0 }], {
    duration: reduceMotion ? 0 : duration,
    easing,
    fill: 'forwards',
  });
  fade.finished
    .catch((error: unknown) => console.warn('[splash] fade interrupted:', error))
    .finally(() => splash.remove());
}
