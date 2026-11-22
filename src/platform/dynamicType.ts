/** iPhone and iPad text follow the phone's Text Size, as native apps do: the web view reports Body's size for the setting
 *  (`-apple-system-body`), and every type token is set from Apple's table for it. Read at launch and whenever the app comes
 *  back to the front (the setting is changed in the Settings app). A Mac keeps tokens.css. */

import { contentSizeFor, typeTokensFor } from '@config/dynamicType.config';
import { platform } from '@platform/index';

/** Body's size, in px, for the phone's Text Size setting. */
function bodySize(): number {
  const probe = document.createElement('span');
  probe.style.font = '-apple-system-body';
  probe.style.position = 'absolute';
  probe.style.visibility = 'hidden';
  document.body.appendChild(probe);
  const px = parseFloat(getComputedStyle(probe).fontSize);
  probe.remove();
  return px;
}

function apply(): void {
  const tokens = typeTokensFor(contentSizeFor(bodySize()));
  const root = document.documentElement.style;
  for (const [name, value] of Object.entries(tokens)) root.setProperty(name, value);
}

/** Call once at startup. */
export function followTextSize(): void {
  if (!platform.followsTextSize) return;
  apply();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') apply();
  });
}
