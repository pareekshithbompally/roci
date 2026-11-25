/** A provider's logo tile (this device's by form factor), in the one tile shape. */

import { IconTile } from '@shared/ui';
import { getProviderTitle, logoOf } from '@shared/utils/provider.utils';
import { useFormFactor } from '@platform/formFactor';

interface ProvidersAvatarProps {
  provider: string;
  /** Px; a list row's list-art size when left out. */
  size?: number;
  /** Its model is working: a light runs round the tile. */
  working?: boolean;
}

export const ProvidersAvatar = ({ provider, size, working }: ProvidersAvatarProps) => (
  <IconTile logo={logoOf(provider, useFormFactor())} size={size} label={getProviderTitle(provider)} working={working} />
);
