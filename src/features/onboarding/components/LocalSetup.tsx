/** First-run server option: one found on this device (where servers run), or one by address; its defaults show once it answers. */

import React, { useMemo, useState } from 'react';
import { Button, Callout, CardRow, Input, Section, Status, WelcomeStep } from '@shared/ui';
import { ProvidersAvatar } from '@shared/components';
import { getProviderTitle } from '@shared/utils/provider.utils';
import { errorMessage } from '@shared/utils/errors';
import { useLocalServers } from '@features/settings';
import type { DetectedProvider } from '@features/settings';
import { ONBOARDING_CONFIG } from '@config/onboarding.config';
import { useGoWithDefaults } from '@features/onboarding/hooks/useGoWithDefaults';
import { useOnboardingBack } from '@features/onboarding/stores/onboardingStore';
import { normalizeLocalUrl, toLocalProvider } from '@services/providers/localServers';
import type { LocalServer } from '@services/providers/localServers';
import { platform } from '@platform/index';
import { DefaultsList } from '@features/settings';

const COPY = ONBOARDING_CONFIG.setup.local;
const ACTIONS = ONBOARDING_CONFIG.actions;

const detectedServer = (server: LocalServer, serverApp?: string): DetectedProvider =>
  ({ id: server.id, listed: server.models, provider: toLocalProvider(server, serverApp) });

interface AddressProps {
  connectedTo: string | null;
  onConnected: (detected: DetectedProvider) => void;
}

/** A server by its address: Connect asks it for its models. */
const AddressSection: React.FC<AddressProps> = ({ connectedTo, onConnected }) => {
  const { probeUrl } = useLocalServers();
  const [address, setAddress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  // Connect waits for a real address; a typed-in word says what one looks like.
  const valid = normalizeLocalUrl(address) !== null;
  const invalid = address.trim() !== '' && !valid;

  const connect = async () => {
    setConnecting(true);
    setError(null);
    try {
      const result = await probeUrl(address.trim());
      if ('error' in result) setError(result.error);
      else onConnected(detectedServer(result.server, result.serverApp));
    } catch (e: unknown) {
      console.error('[LocalSetup] Connecting failed:', e);
      setError(errorMessage(e));
    } finally {
      setConnecting(false);
    }
  };

  return (
    <>
      <Section title={COPY.address} footer={invalid ? COPY.addressInvalid : connectedTo ? COPY.connectedTo(connectedTo) : COPY.addressHint}>
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
            trailing={<Button type="submit" variant="outline" size="sm" disabled={connecting || !valid}>{ACTIONS.connect}</Button>}
          />
        </form>
      </Section>
      {error && <Callout variant="error">{error}</Callout>}
    </>
  );
};

export const LocalSetup: React.FC = () => {
  const { rows, isScanning } = useLocalServers();
  const back = useOnboardingBack();
  const [chosen, setChosen] = useState<DetectedProvider | null>(null);
  const running = useMemo(() => rows.filter((row) => row.running), [rows]);
  // The only server here needs no choosing.
  const only = useMemo(() => (platform.runsLocalServers && running.length === 1 ? detectedServer(running[0]) : null), [running]);
  const detected = chosen ?? only;
  const { setup, action } = useGoWithDefaults(detected);
  const byAddress = chosen && !running.some((row) => row.id === chosen.id) ? chosen : null;

  return (
    <WelcomeStep title={COPY.heading} primary={action} onBack={back}>
      {/* Servers already running here (only a device that runs servers looks). */}
      {platform.runsLocalServers && (
        <Section title={COPY.found} footer={running.length === 0 ? (isScanning ? COPY.scanning : COPY.none) : undefined}>
          {running.map((row) => (
            <CardRow
              key={row.id}
              leading={<ProvidersAvatar provider={row.id} />}
              title={getProviderTitle(row.id)}
              description={row.baseUrl}
              status={row.id === detected?.id && <Status state="ready">{COPY.connected}</Status>}
              action={row.id === detected?.id ? undefined : { label: ACTIONS.use, onPress: () => setChosen(detectedServer(row)) }}
            />
          ))}
        </Section>
      )}
      <AddressSection connectedTo={byAddress?.provider?.base_url ?? null} onConnected={setChosen} />
      {setup && <DefaultsList defaults={setup.defaults} />}
    </WelcomeStep>
  );
};
