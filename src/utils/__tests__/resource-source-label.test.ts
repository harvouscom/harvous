import { describe, expect, it } from 'vitest';
import {
  formatResourceFileBytes,
  resourceFileLabel,
  resourceSourceLabel,
} from '../resource-source-label';

describe('resourceSourceLabel', () => {
  it('prefers the domain over a host-derived site name', () => {
    // "En Wikipedia" is what the metadata endpoint invents for a page with no
    // og:site_name — the subdomain becomes a capitalized word.
    expect(resourceSourceLabel('en.wikipedia.org', 'En Wikipedia')).toBe('en.wikipedia.org');
  });

  it('drops a www prefix', () => {
    expect(resourceSourceLabel('www.desiringgod.org')).toBe('desiringgod.org');
  });

  it('lowercases and trims', () => {
    expect(resourceSourceLabel('  EN.Wikipedia.ORG ')).toBe('en.wikipedia.org');
  });

  it('falls back to the site name when there is no domain', () => {
    expect(resourceSourceLabel(null, 'Desiring God')).toBe('Desiring God');
    expect(resourceSourceLabel('', 'Desiring God')).toBe('Desiring God');
  });

  it('returns an empty string when it has nothing to show', () => {
    expect(resourceSourceLabel(null, null)).toBe('');
    expect(resourceSourceLabel(undefined, undefined)).toBe('');
  });
});

describe('resourceFileLabel', () => {
  it('labels by mime short-name and size', () => {
    expect(resourceFileLabel('application/pdf', 2.1 * 1024 * 1024)).toBe('PDF · 2.1 MB');
    expect(resourceFileLabel('audio/mpeg', 900 * 1024)).toBe('MP3 · 900 KB');
  });

  it('falls back to the filename extension for unknown mimes', () => {
    expect(resourceFileLabel('application/octet-stream', 1024, 'notes.epub')).toBe('EPUB · 1 KB');
  });

  it('degrades to "File" when nothing is known', () => {
    expect(resourceFileLabel(null, null, null)).toBe('File');
  });

  it('rounds sizes sensibly', () => {
    expect(formatResourceFileBytes(500)).toBe('500 B');
    expect(formatResourceFileBytes(15 * 1024 * 1024)).toBe('15 MB');
    expect(formatResourceFileBytes(0)).toBe('');
  });
});
