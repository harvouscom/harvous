import { describe, expect, it } from 'vitest';
import { findScriptureInOcrText } from '@/utils/ocr/ocr-scripture';
import { buildScannedPassageNoteHtml, buildScannedTextNoteHtml } from '../scan-note-html';

function pills(html: string) {
  return [...html.matchAll(/data-scripture-reference="([^"]+)"[^>]*data-scripture-translation="([^"]+)"/g)].map(
    (m) => `${m[1]} ${m[2]}`,
  );
}

describe('buildScannedTextNoteHtml', () => {
  const scan = findScriptureInOcrText('Read Rom 8:28 (ESV) and 1Co 13:4 today.\n\nThen John 3:16');

  it('pills each reference in the translation printed beside it, else the reader’s default', () => {
    const html = buildScannedTextNoteHtml(scan.paragraphs, { defaultTranslation: 'NET' });
    expect(pills(html)).toEqual(['Romans 8:28 ESV', '1 Corinthians 13:4 NET', 'John 3:16 NET']);
    expect(html).not.toContain('ESV)');
    expect(html).toContain('<p>Then <span');
    expect(html.endsWith('</span> </p><p></p>')).toBe(true);
  });

  it('applies the reader’s translation picks and leaves un-pilled references as printed', () => {
    const html = buildScannedTextNoteHtml(scan.paragraphs, {
      defaultTranslation: 'NET',
      translationOverrides: new Map([['john 3:16', 'KJV']]),
      excluded: new Set(['romans 8:28']),
    });
    expect(pills(html)).toEqual(['1 Corinthians 13:4 NET', 'John 3:16 KJV']);
    expect(html).toContain('Read Romans 8:28 ESV and');
  });

  it('escapes the scanned words', () => {
    const html = buildScannedTextNoteHtml(findScriptureInOcrText('a < b & <script>').paragraphs, {
      defaultTranslation: 'NET',
    });
    expect(html).toBe('<p>a &lt; b &amp; &lt;script&gt;</p><p></p>');
  });
});

describe('buildScannedPassageNoteHtml', () => {
  it('quotes the corpus text above the pill', () => {
    const html = buildScannedPassageNoteHtml({
      reference: 'John 3:16-17',
      translation: 'KJV',
      text: 'For God so loved the world…',
    });
    expect(html.indexOf('<blockquote')).toBe(0);
    expect(html).toContain('data-scripture-quote-translation="KJV"');
    expect(pills(html)).toEqual(['John 3:16-17 KJV']);
  });
});
