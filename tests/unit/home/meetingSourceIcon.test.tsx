import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MeetingSourceIcon } from '@features/home/components/MeetingSourceIcon';
import { INTEGRATIONS_CONFIG } from '@config/integrations.config';

const show = (inputSource?: string) =>
  render(<QueryClientProvider client={new QueryClient()}><MeetingSourceIcon inputSource={inputSource} /></QueryClientProvider>).container;

describe('MeetingSourceIcon', () => {
  it('a meeting from Hex shows Hex\'s icon, named on hover', () => {
    const icon = show('hex');
    expect(icon.querySelector('img')?.getAttribute('src')).toBe(INTEGRATIONS_CONFIG.hex.icon);
    expect(icon.querySelector('[title]')?.getAttribute('title')).toBe('From Hex');
  });

  it('a meeting recorded or imported in Roci shows Roci\'s mark', () => {
    for (const source of ['systemAndMicrophone', 'transcript-import', undefined]) {
      const icon = show(source);
      expect(icon.querySelector('img')).toBeNull();
      expect(icon.querySelector('svg')).not.toBeNull();
      expect(icon.querySelector('[title]')?.getAttribute('title')).toBe('From Roci');
    }
  });
});
