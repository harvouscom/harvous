import { describe, expect, it } from 'vitest';
import { subjectTagCandidatesFromText, mergeSubjectTagSuggestions } from '../subject-tag-candidates';
import { suggestAutoTagsFromNote } from '../bible-study-tag-web';

describe('subjectTagCandidatesFromText', () => {
  it('maps informal prose to canonical subjects', () => {
    const candidates = subjectTagCandidatesFromText(
      '',
      'Been overwhelmed about bills lately, trusting God for provision',
    );
    const names = candidates.map((c) => c.name);
    expect(names).toContain('Fear');
    expect(names).toContain('Stewardship');
    expect(names).toContain('Provision');
  });

  it('records matchedPhrase for synonym hits', () => {
    const candidates = subjectTagCandidatesFromText('', 'I am so overwhelmed lately');
    const fear = candidates.find((c) => c.name === 'Fear');
    expect(fear?.matchedPhrase).toBe('overwhelmed');
    expect(fear?.confidence).toBe(0.72);
  });

  it('prefers title name matches over body synonym matches', () => {
    const candidates = subjectTagCandidatesFromText('Parenting struggles', 'kids acting up at home');
    const parenting = candidates.find((c) => c.name === 'Parenting');
    expect(parenting?.confidence).toBe(0.82);
  });

  it('excludes folder labels and existing tag names', () => {
    const candidates = subjectTagCandidatesFromText(
      'Marriage notes',
      'fighting with my wife',
      { excludeLabels: ['Marriage'], existingTagNames: ['Trust'] },
    );
    expect(candidates.some((c) => c.name === 'Marriage')).toBe(false);
  });

  it('skips Friendship for fellowship hall (life keyword context)', () => {
    const candidates = subjectTagCandidatesFromText(
      'Sunday',
      'We had coffee in the fellowship hall after church.',
    );
    expect(candidates.some((c) => c.name === 'Friendship')).toBe(false);
  });

  it('caps at four subject tags', () => {
    const text =
      'overwhelmed about bills, grieving loss, lonely and isolated, doubting faith, angry at work burnout';
    expect(subjectTagCandidatesFromText('', text).length).toBeLessThanOrEqual(4);
  });
});

describe('mergeSubjectTagSuggestions', () => {
  it('dedupes against keyword hits via concept overlap', () => {
    const base = [{ name: 'Grace', category: 'spiritual', confidence: 0.9 }];
    const merged = mergeSubjectTagSuggestions(base, [
      { name: 'Mercy', category: 'spiritual', confidence: 0.76, source: 'subject' },
    ]);
    expect(merged.some((s) => s.name === 'Mercy')).toBe(false);
  });
});

describe('suggestAutoTagsFromNote with subjects', () => {
  it('includes subject tags alongside keyword tags', () => {
    const tags = suggestAutoTagsFromNote('', '<p>Small group discussion on suffering in Romans 8.</p>');
    const names = tags.map((t) => t.name);
    expect(names).toContain('Suffering');
    expect(names.some((n) => n.toLowerCase() === 'romans')).toBe(true);
  });

  it('tags informal money language as Stewardship', () => {
    const tags = suggestAutoTagsFromNote('', '<p>Tight on money this month but trusting God.</p>');
    expect(tags.some((t) => t.name === 'Stewardship')).toBe(true);
  });
});
