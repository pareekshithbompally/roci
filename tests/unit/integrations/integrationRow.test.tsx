import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IntegrationRow } from '@features/integrations/components/IntegrationRow';
import { eventKitAccess } from '@features/integrations/utils/eventKitAccess';
import type { IntegrationControls } from '@features/integrations/types';

function controls(overrides: Partial<IntegrationControls>): IntegrationControls {
  return { access: 'ready', enabled: false, setEnabled: vi.fn(), request: vi.fn(), openSettings: vi.fn(), ...overrides };
}

const renderRow = (c: IntegrationControls) =>
  render(
    <IntegrationRow {...c} icon={null} title="Calendar" description="desc" deniedHint="Denied hint">
      <div>calendar settings</div>
    </IntegrationRow>,
  );

describe('eventKitAccess', () => {
  it('maps EventKit status onto the shared permission states', () => {
    expect(eventKitAccess('authorized')).toBe('ready');
    expect(eventKitAccess('not_determined')).toBe('needs-request');
    expect(eventKitAccess('denied')).toBe('needs-settings');
    expect(eventKitAccess('restricted')).toBe('needs-settings');
  });
});

describe('IntegrationRow', () => {
  it('disables the switch until macOS answers, and shows no access row on a guess', () => {
    renderRow(controls({ access: 'unknown', enabled: true }));
    expect(screen.getByRole('switch')).toBeDisabled();
    expect(screen.queryByText('macOS access')).not.toBeInTheDocument();
    expect(screen.queryByText('calendar settings')).not.toBeInTheDocument();
  });

  it('connected: switch on and its settings, no access row', () => {
    renderRow(controls({ access: 'ready', enabled: true }));
    expect(screen.getByRole('switch')).toBeChecked();
    expect(screen.getByText('calendar settings')).toBeInTheDocument();
    expect(screen.queryByText('macOS access')).not.toBeInTheDocument();
  });

  it('on but undecided: Allow asks macOS', () => {
    const c = controls({ access: 'needs-request', enabled: true });
    renderRow(c);
    fireEvent.click(screen.getByRole('button', { name: 'Allow' }));
    expect(c.request).toHaveBeenCalled();
    expect(screen.queryByText('calendar settings')).not.toBeInTheDocument();
  });

  it('on but denied: explains where, and opens System Settings', () => {
    const c = controls({ access: 'needs-settings', enabled: true });
    renderRow(c);
    expect(screen.getByText('desc Denied hint')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open Settings' }));
    expect(c.openSettings).toHaveBeenCalled();
  });

  it('off: just the row, whatever the access', () => {
    renderRow(controls({ access: 'needs-settings', enabled: false }));
    expect(screen.queryByText('macOS access')).not.toBeInTheDocument();
    expect(screen.getByText('desc')).toBeInTheDocument();
  });

  it('unavailable: switch disabled, the reason in the footer', () => {
    renderRow(controls({ access: 'unavailable', unavailableReason: 'Needs iOS 26.' }));
    expect(screen.getByRole('switch')).toBeDisabled();
    expect(screen.getByText('desc Needs iOS 26.')).toBeInTheDocument();
  });
});
