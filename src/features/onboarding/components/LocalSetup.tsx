/** First-run Local option: a server found on this Mac, or one by address; picking one finishes setup. */

import React, { useState } from 'react';
import { Button, Callout, Card, CardRow, ICON_SIZE_PX, Input, Text } from '@shared/ui';
import { ProvidersAvatar } from '@shared/components';
import { useSettings } from '@shared/contexts/SettingsContext';
import { getProviderTitle } from '@shared/utils/provider.utils';
import { errorMessage } from '@shared/utils/errors';
import { useLocalServers } from '@features/settings';
import { ONBOARDING_CONFIG } from '@config/onboarding.config';
import { useFinishOnboarding } from '@features/onboarding/hooks/useFinishOnboarding';
import { useSetOnboardingStep } from '@features/onboarding/stores/onboardingStore';
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
    <div className="flex flex-col gap-6">
      <Text as="h1" variant="pageTitle" className="text-center">{COPY.heading}</Text>

      {running.length > 0 ? (
        <Card>
          {running.map((row) => (
            <CardRow
              key={row.id}
              leading={<ProvidersAvatar provider={row.id} size={ICON_SIZE_PX.lg} />}
              title={getProviderTitle(row.id)}
              description={row.baseUrl}
              actions={<Button variant="outline" size="sm" onClick={() => use(row)}>{ACTIONS.use}</Button>}
            />
          ))}
        </Card>
      ) : (
        <Text as="p" variant="helper" tone="muted" className="text-center">
          {isScanning ? COPY.scanning : COPY.none}
        </Text>
      )}

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void connect();
        }}
      >
        <Input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder={COPY.placeholder}
          aria-label={COPY.address}
          className="flex-1"
        />
        <Button type="submit" variant="primary" disabled={connecting || !address.trim()}>
          {ACTIONS.connect}
        </Button>
      </form>
      {error && <Callout variant="error">{error}</Callout>}

      <Button variant="ghost" size="sm" onClick={() => setStep('setup')} className="self-center">
        {ACTIONS.back}
      </Button>
    </div>
  );
};
