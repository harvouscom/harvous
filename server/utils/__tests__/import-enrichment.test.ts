import { describe, expect, it } from 'vitest';
import { autoTagExcludeOptionsForImport } from '../import-enrichment';
import { mergeAdditionalScriptureReferences } from '../process-scripture-references';
import { detectScriptureReferences } from '@/utils/scripture-detector';

describe('mergeAdditionalScriptureReferences', () => {
  it('returns body detections unchanged when additional is empty', () => {
    const body = detectScriptureReferences('Read John 3:16 today');
    expect(mergeAdditionalScriptureReferences(body, undefined)).toEqual(body);
    expect(mergeAdditionalScriptureReferences(body, [])).toEqual(body);
  });

  it('adds portable refs that are not in the body', () => {
    const body = detectScriptureReferences('A note with no verse citations.');
    const merged = mergeAdditionalScriptureReferences(body, ['Romans 8:28', '  Psalm 23:1  ']);
    const refs = merged.map((r) => r.reference);
    expect(refs).toContain('Romans 8:28');
    // normalizeScriptureReference canonicalizes Psalm → Psalms
    expect(refs.some((r) => /Psalms?\s+23:1/i.test(r))).toBe(true);
  });

  it('does not duplicate a ref already detected in the body', () => {
    const body = detectScriptureReferences('Read John 3:16 today');
    const merged = mergeAdditionalScriptureReferences(body, ['John 3:16', 'john 3:16']);
    const johnCount = merged.filter(
      (r) => r.reference.replace(/\s+/g, '').toLowerCase() === 'john3:16',
    ).length;
    expect(johnCount).toBe(1);
  });

  it('ignores invalid reference strings', () => {
    const body = detectScriptureReferences('Hello');
    const merged = mergeAdditionalScriptureReferences(body, ['not a verse', '', '   ']);
    expect(merged).toEqual(body);
  });
});

describe('autoTagExcludeOptionsForImport', () => {
  it('excludes folder labels and manual tag names', () => {
    const opts = autoTagExcludeOptionsForImport({
      primaryCollection: 'Sermons 2026',
      secondaryCollections: ['Year/Series'],
      manualTagNames: ['grace', 'Faith'],
    });
    expect(opts.excludeLabels).toEqual(expect.arrayContaining(['Sermons 2026', 'Year/Series']));
    const excludedLower = opts.excludeTagNames.map((n) => n.trim().toLowerCase());
    expect(excludedLower).toEqual(expect.arrayContaining(['sermons 2026', 'year/series', 'grace', 'faith']));
  });

  it('merges dismissed auto-tags into excludeTagNames', () => {
    const opts = autoTagExcludeOptionsForImport({
      primaryCollection: null,
      secondaryCollections: [],
      dismissedAutoTags: JSON.stringify(['salvation']),
      manualTagNames: ['hope'],
    });
    const excludedLower = opts.excludeTagNames.map((n) => n.trim().toLowerCase());
    expect(excludedLower).toEqual(expect.arrayContaining(['salvation', 'hope']));
  });
});
