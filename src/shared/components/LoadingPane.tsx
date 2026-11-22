/** A chat or meeting while it loads: one spinner, centred in the space its content will fill (the content fades in after). */

import React from 'react';
import { Spinner } from '@shared/ui';
import { KIT_COPY } from '@config/kitCopy.config';

export const LoadingPane: React.FC = () => (
  <div role="status" aria-label={KIT_COPY.loading} className="flex h-full w-full flex-1 items-center justify-center">
    <Spinner />
  </div>
);
