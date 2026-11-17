/** First-run Local option: a server found on this Mac, or one by address; picking one finishes setup. */

import React, { useState } from 'react';
import { Button, Callout, CardRow, ICON_SIZE_PX, Input, Section, WelcomeStep } from '@shared/ui';
import { ProvidersAvatar } from '@shared/components';
import { useSettings } from '@shared/contexts/SettingsContext';
import { getProviderTitle } from '@shared/utils/provider.utils';
import { errorMessage } from '@shared/utils/errors';
import { useLocalServers } from '@features/settings';
import { ONBOARDING_CONFIG } from '@config/onboarding.config';
import { useFinishOnboarding } from '@features/onboarding/hooks/useFinishOnboarding';
import { useSetOnboardingStep } from '@features/onboarding/stores/onboardingStore';
import { normalizeLocalUrl } from '@services/providers/localServers';
import type { LocalRow } from '@services/providers/localServers';

const COPY = ONBOARDING_CONFIG.setup.local;
const ACTIONS = ONBOARDING_CONFIG.actions;

export const LocalSetup: React.FC = () => {
  const { rows, isScanning, enable, addUrl } = useLocalServers();
  const { setSelectedProviderName } = useSettings();
  const finish = useFinishOnboarding();
  const setStep = useSetOnboardingStep();
  const [address, setAddress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const running = rows.filter((row) => row.running);
  // Connect waits for a real address; a typed-in word says what one looks like.
  const valid = normalizeLocalUrl(address) !== null;
  const invalid = address.trim() !== '' && !valid;

  const use = (row: LocalRow) => {
    if (row.saved) setSelectedProviderName(row.id);
    else enable(row);
    finish();
  };

  const connect = async () => {
    setConnecting(true);
    setError(null);
    try {
      const result = await addUrl(address.trim());
      if ('error' in result) setError(result.error);
      else finish();
    } catch (e: unknown) {
      console.error('[LocalSetup] Connecting failed:', e);
      setError(errorMessage(e));
    } finally {
      setConnecting(false);
    }
  };

  return (
    <WelcomeStep title={COPY.heading} secondary={{ label: ACTIONS.back, onClick: () => setStep('setup') }}>
      {/* Servers already running here, each one tap away. */}
      <Section title={COPY.found} footer={running.length === 0 ? (isScanning ? COPY.scanning : COPY.none) : undefined}>
        {running.map((row) => (
          <CardRow
            key={row.id}
            leading={<ProvidersAvatar provider={row.id} size={ICON_SIZE_PX.lg} />}
            title={getProviderTitle(row.id)}
            description={row.baseUrl}
            actions={<Button variant="outline" size="sm" onClick={() => use(row)}>{ACTIONS.use}</Button>}
          />
        ))}
      </Section>

      {/* Or one by its address. */}
      <Section title={COPY.address} footer={invalid ? COPY.addressInvalid : COPY.addressHint}>
        <form
          className="py-3"
          onSubmit={(e) => {
            e.preventDefault();
            void connect();
          }}
        >
          <Input
            type="url"
            aria-invalid={invalid || undefined}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder={COPY.placeholder}
            aria-label={COPY.address}
            trailing={
              <Button type="submit" variant="outline" size="sm" disabled={connecting || !valid}>
                {ACTIONS.connect}
              </Button>
            }
          />
        </form>
      </Section>
      {error && <Callout variant="error">{error}</Callout>}
    </WelcomeStep>
  );
};
