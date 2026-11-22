/** Where a view's figures came from, under it: the source's name, a link to its page when there is one. */

import React from 'react';
import { Button } from '@shared/ui';
import { openUrl } from '@services/tauri';
import { RESULT_VIEWS_COPY as COPY } from '@config/resultViews.config';
import type { ViewSource } from '@core/ai';

export const SourceLine: React.FC<{ source: ViewSource; asOf?: string }> = ({ source, asOf }) => {
  const label = COPY.source(source.name);
  const { url } = source;
  return (
    <>
      {url ? <Button variant="link" size="inline" onClick={() => void openUrl(url)}>{label}</Button> : label}
      {asOf && ` · ${COPY.asOf(asOf)}`}
    </>
  );
};
