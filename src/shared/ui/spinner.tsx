/** The one loading indicator: a turning ring in the faint tone. */

import { Loader2 } from 'lucide-react';
import { Icon, type IconSize } from './icon';

/** The faint turning ring, at an icon size. */
export function Spinner({ size = 'md' }: { size?: IconSize }) {
  return <Icon icon={Loader2} size={size} tone="faint" className="animate-spin" />;
}
