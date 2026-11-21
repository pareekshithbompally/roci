import { describe, it, expect } from 'vitest';
import {
  extractDomain,
  getFaviconUrl,
  describeCitation,
} from '@shared/utils/citationUtils';

// ── extractDomain ───────────────────────────────────────────────

describe('extractDomain', () => {
  it('strips www. prefix', () => {
    expect(extractDomain('https://www.example.com/path')).toBe('example.com');
  });

  it('handles https URLs', () => {
    expect(extractDomain('https://docs.rust-lang.org/book/')).toBe('docs.rust-lang.org');
  });

  it('handles http URLs', () => {
    expect(extractDomain('http://example.com')).toBe('example.com');
  });

  it('preserves subdomains other than www', () => {
    expect(extractDomain('https://api.github.com/repos')).toBe('api.github.com');
  });

  it('returns the raw string for an invalid URL', () => {
    expect(extractDomain('not-a-url')).toBe('not-a-url');
  });

  it('returns empty string for an empty string', () => {
    expect(extractDomain('')).toBe('');
  });

  it('handles URL with port', () => {
    expect(extractDomain('https://localhost:3000/api')).toBe('localhost');
  });

  it('handles URL with auth', () => {
    expect(extractDomain('https://user:pass@www.example.com')).toBe('example.com');
  });

  it('strips www. only at start of hostname', () => {
    // subdomain like "www2.example.com" should be kept
    expect(extractDomain('https://www2.example.com')).toBe('www2.example.com');
  });
});

// ── getFaviconUrl ───────────────────────────────────────────────

describe('getFaviconUrl', () => {
  it('builds the favicon URL for a site at the default size', () => {
    expect(getFaviconUrl('example.com')).toBe('https://www.google.com/s2/favicons?domain=example.com&sz=16');
  });

  it('uses a custom size', () => {
    expect(getFaviconUrl('example.com', 32)).toBe('https://www.google.com/s2/favicons?domain=example.com&sz=32');
  });

  it('encodes the domain', () => {
    expect(getFaviconUrl('exämple.com')).toBe('https://www.google.com/s2/favicons?domain=ex%C3%A4mple.com&sz=16');
  });
});

// ── describeCitation ────────────────────────────────────────────

describe('describeCitation', () => {
  it('shows a titled source as title over site', () => {
    expect(describeCitation({ url: 'https://www.nature.com/articles/x', title: 'A study' }))
      .toEqual({ name: 'A study', site: 'nature.com', detail: 'nature.com' });
  });

  it('tells untitled pages of one site apart by path', () => {
    expect(describeCitation({ url: 'https://www.humanbaseline.org/benchmarks/?utm_source=openai', title: '' }))
      .toEqual({ name: 'humanbaseline.org', site: 'humanbaseline.org', detail: '/benchmarks' });
  });

  it('gives an untitled home page no detail line', () => {
    expect(describeCitation({ url: 'https://www.humanbaseline.org/', title: '' }).detail).toBeNull();
  });

  it('reads the real site of a Gemini search redirect from its title', () => {
    expect(describeCitation({ url: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc', title: 'mit.edu' }))
      .toEqual({ name: 'mit.edu', site: 'mit.edu', detail: null });
  });
});
