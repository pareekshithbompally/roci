/** Show in Finder, the one way everywhere: Finder's own icon at list-art size in a round push button (named on hover);
 *  nothing where there is no Finder. */

import React from 'react';
import { Button } from '@shared/ui';
import { APP_CONFIG } from '@config/app.config';
import { UI_CONFIG } from '@config/ui.config';
import { platform } from '@platform/index';
import { SHOW_IN_FINDER, showInFinder } from '@shared/utils/savedFileToast';
import { AppIcon } from './AppIcon';

export const ShowInFinderButton: React.FC<{ path: string | null | undefined }> = ({ path }) =>
  platform.hasFileManager ? (
    <Button variant="outline" size="iconSm" disabled={!path} onClick={() => path && showInFinder(path)} aria-label={SHOW_IN_FINDER} title={SHOW_IN_FINDER}>
      <AppIcon app={APP_CONFIG.macApps.finder} size="tile" fallback={UI_CONFIG.appIcons.finder} />
    </Button>
  ) : null;
