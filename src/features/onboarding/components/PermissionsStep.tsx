/** First-run step on a device that records: what recording needs, then what's optional; each row asks natively, or
 *  opens System Settings with the drag guide. */

import React from 'react';
import { CardRow, Section, WelcomeStep } from '@shared/ui';
import { PermissionAction } from '@shared/components';
import { ONBOARDING_CONFIG, ONBOARDING_ICONS } from '@config/onboarding.config';
import { useOnboardingPermissions, type OnboardingPermission } from '@features/onboarding/hooks/useOnboardingPermissions';
import { useSetOnboardingStep } from '@features/onboarding/stores/onboardingStore';
import { OnboardingIcon } from './OnboardingIcon';

const COPY = ONBOARDING_CONFIG.permissions;
const ACTIONS = ONBOARDING_CONFIG.actions;

const PermissionRow: React.FC<{ row: OnboardingPermission }> = ({ row }) => (
  <CardRow
    leading={<OnboardingIcon source={ONBOARDING_ICONS[row.id]} />}
    title={COPY.rows[row.id].title}
    actions={row.access === 'unknown' ? undefined : (
      <PermissionAction state={row.access} onRequest={row.request} onOpenSettings={row.openSettings} />
    )}
  />
);

export const PermissionsStep: React.FC = () => {
  const { rows, requiredReady, applyGranted } = useOnboardingPermissions();
  const setStep = useSetOnboardingStep();
  const next = () => {
    applyGranted();
    setStep('setup');
  };
  const required = rows.filter((row) => COPY.rows[row.id].required);
  const optional = rows.filter((row) => !COPY.rows[row.id].required);

  return (
    <WelcomeStep
      title={COPY.heading}
      subtitle={COPY.subheading}
      primary={{ label: ACTIONS.continue, onClick: next, disabled: !requiredReady }}
      secondary={{ label: ACTIONS.later, onClick: next }}
    >
      {required.length > 0 && (
        <Section title={COPY.required.title} footer={COPY.required.footer}>
          {required.map((row) => <PermissionRow key={row.id} row={row} />)}
        </Section>
      )}
      {optional.length > 0 && (
        <Section title={COPY.optional.title} footer={COPY.optional.footer}>
          {optional.map((row) => <PermissionRow key={row.id} row={row} />)}
        </Section>
      )}
    </WelcomeStep>
  );
};
