import { describe, it, expect, afterEach } from 'vitest';
import { mermaidTheme } from '@shared/components/markdown/mermaidTheme';

const root = document.documentElement.style;

describe('mermaidTheme', () => {
  afterEach(() => ['--text-primary', '--text-muted', '--bg-layer-2'].forEach((name) => root.removeProperty(name)));

  it('draws diagrams in the live token colours, on a transparent background', () => {
    root.setProperty('--text-primary', '#161616');
    root.setProperty('--text-muted', '#6f6f6f');
    root.setProperty('--bg-layer-2', '#f0f0f0');
    const { config } = mermaidTheme();
    expect(config).toMatchObject({
      theme: 'base',
      themeVariables: { background: 'transparent', textColor: '#161616', lineColor: '#6f6f6f', primaryColor: '#f0f0f0' },
    });
  });
});
