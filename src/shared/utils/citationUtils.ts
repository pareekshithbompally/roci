/** Web citation helpers: favicon URLs, domain extraction, display labels. */

import type { WebCitation } from '@shared/types';

const FAVICON_BASE = 'https://www.google.com/s2/favicons';
const WWW_PREFIX = /^www\./;
/** Gemini's Google Search sources link through this redirect host and carry the real site in `title`. */
const GROUNDING_REDIRECT_HOST = 'vertexaisearch.cloud.google.com';
const TRAILING_SLASH = /\/$/;

/** Display hostname without the 'www.' prefix, e.g. 'example.com'. */
export function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(WWW_PREFIX, '');
  } catch {
    return url;
  }
}

/** Favicon URL for a site (a bare domain, e.g. `describeCitation(c).site`) from Google's favicon service. */
export function getFaviconUrl(domain: string, size = 16): string {
  return `${FAVICON_BASE}?domain=${encodeURIComponent(domain)}&sz=${size}`;
}

/** How a source reads in a list: its name, its site (the favicon's domain too), and a line telling its pages apart. */
export interface CitationLabel {
  name: string;
  site: string;
  detail: string | null;
}

/** Page path without query or trailing slash ('/benchmarks'); null for a site's home page. */
function pagePath(url: string): string | null {
  try {
    return decodeURIComponent(new URL(url).pathname).replace(TRAILING_SLASH, '') || null;
  } catch {
    return null;
  }
}

/** A titled source shows its title over its site; an untitled one its site over its page path. */
export function describeCitation({ url, title }: WebCitation): CitationLabel {
  const linkHost = extractDomain(url);
  if (linkHost === GROUNDING_REDIRECT_HOST) {
    const site = title || linkHost;
    return { name: site, site, detail: null };
  }
  if (title && title !== linkHost) return { name: title, site: linkHost, detail: linkHost };
  return { name: linkHost, site: linkHost, detail: pagePath(url) };
}
