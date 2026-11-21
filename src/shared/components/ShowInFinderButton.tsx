/** Show in Finder, the one way everywhere: the kit's square toolbar IconButton with Finder's own icon (macOS's, else the
 *  bundled one), named on hover; nothing where there is no Finder. */

import React from 'react';
import { IconButton } from '@shared/ui';
import { APP_CONFIG } from '@config/app.config';
import { UI_CONFIG } from '@config/ui.config';
import { platform } from '@platform/index';
import { SHOW_IN_FINDER, showInFinder } from '@shared/utils/savedFileToast';
import { useAppIcon } from './AppIcon';

export const ShowInFinderButton: React.FC<{ path: string | null | undefined }> = ({ path }) => {
  const finder = useAppIcon(APP_CONFIG.macApps.finder) ?? UI_CONFIG.appIcons.finder;
  if (!platform.hasFileManager) return null;
  return (
    <IconButton
      image={finder}
      appIcon
      label={SHOW_IN_FINDER}
      size="toolbar"
      variant="outline"
      disabled={!path}
      onClick={() => path && showInFinder(path)}
    />
  );
};
