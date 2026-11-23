/** Settings couldn't be read: says why and tries again, in place of the app (never the first-run flow). */

import React from 'react';
import { WelcomeFrame, WelcomeStep } from '@shared/ui';
import { APP_CONFIG } from '@config/app.config';
import { ONBOARDING_CONFIG } from '@config/onboarding.config';
import { useSettings } from '@shared/contexts/SettingsContext';
import { errorMessage } from '@shared/utils/errors';

export const LoadErrorView: React.FC = () => {
  const { loadError, reload } = useSettings();
  return (
    <WelcomeFrame stepKey="load-error">
      <WelcomeStep
        icon={APP_CONFIG.icon}
        title={ONBOARDING_CONFIG.loadError}
        subtitle={errorMessage(loadError)}
        primary={{ label: ONBOARDING_CONFIG.actions.retry, onClick: reload }}
      />
    </WelcomeFrame>
  );
};
