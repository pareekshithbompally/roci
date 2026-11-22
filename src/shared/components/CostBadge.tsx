/** What some work cost, as a badge beside its ModelBadge ("$0.0012"); nothing when it was free (it ran on this device) or
 *  any of it has no price. */

import React from 'react';
import { Badge } from '@shared/ui';
import { formatCost } from '@extensions/usage/format';
import type { SessionCost } from '@extensions/usage';

export const CostBadge: React.FC<{ cost: SessionCost | null | undefined }> = ({ cost }) => {
  if (!cost || cost.unpriced > 0 || cost.total === 0) return null;
  return <Badge tinted dot={false} className="shrink-0 tabular-nums">{formatCost(cost.total, true)}</Badge>;
};
