/** First-run step 1: what Roci needs from macOS; each row asks natively, or opens System Settings with the drag guide. */

import React from 'react';
import { Bell, CalendarDays, Mic, Volume2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Badge, Button, Card, CardRow, IconTile, Text } from '@shared/ui';
import { PermissionAction } from '@shared/components';
import { ONBOARDING_CONFIG, type OnboardingPermissionId } from '@config/onboarding.config';
import { useOnboardingPermissions, type OnboardingPermission } from '@features/onboarding/hooks/useOnboardingPermissions';
import { useSetOnboardingStep } from '@features/onboarding/stores/onboardingStore';

const COPY = ONBOARDING_CONFIG.permissions;
const ACTIONS = ONBOARDING_CONFIG.actions;

const ICONS: Record<OnboardingPermissionId, LucideIcon> = {
  microphone: Mic,
  'system-audio': Volume2,
  notifications: Bell,
  calendar: CalendarDays,
};

const PermissionRow: React.FC<{ row: OnboardingPermission }> = ({ row }) => {
  const copy = COPY.rows[row.id];
  return (
    <CardRow
      leading={<IconTile icon={ICONS[row.id]} tone={copy.tone} />}
      title={
        <span className="inline-flex items-center gap-2">
          {copy.title}
          {!copy.required && <Badge dot={false}>{COPY.optional}</Badge>}
        </span>
      }
      description={copy.detail}
      actions={row.access === 'unknown' ? undefined : (
        <PermissionAction state={row.access} onRequest={row.request} onOpenSettings={row.openSettings} />
      )}
    />
  );
};

export const PermissionsStep: React.FC = () => {
  const { rows, requiredReady } = useOnboardingPermissions();
  const setStep = useSetOnboardingStep();
  const next = () => setStep('setup');

  return (
    <div className="flex flex-col items-center gap-6">
      <Text as="h1" variant="pageTitle" className="text-center">{COPY.heading}</Text>
      <Card className="w-full">
        {rows.map((row) => <PermissionRow key={row.id} row={row} />)}
      </Card>
      <div className="flex flex-col items-center gap-2">
        <Button variant="primary" onClick={next} disabled={!requiredReady}>{ACTIONS.continue}</Button>
        <Button variant="ghost" size="sm" onClick={next}>{ACTIONS.later}</Button>
      </div>
    </div>
  );
};
