import { describe, expect, it } from 'vitest';
import { LEGAL, legalDocumentsDue, legalDocumentsPhrase } from '../legal-versions';

describe('legalDocumentsDue', () => {
  it('owes both documents to an account that has acknowledged nothing', () => {
    expect(legalDocumentsDue({})).toEqual(['privacy', 'terms']);
  });

  it('owes nothing once the current versions are acknowledged', () => {
    expect(legalDocumentsDue({ privacy: LEGAL.privacy.version, terms: LEGAL.terms.version })).toEqual([]);
  });

  it('owes only the document that changed since', () => {
    expect(legalDocumentsDue({ privacy: '2025-01-01', terms: LEGAL.terms.version })).toEqual(['privacy']);
  });

  it('versions are ISO dates, so they compare as text', () => {
    for (const doc of Object.values(LEGAL)) expect(doc.version).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('legalDocumentsPhrase', () => {
  it('names one document, or both', () => {
    expect(legalDocumentsPhrase(['privacy'])).toBe('Privacy Policy');
    expect(legalDocumentsPhrase(['terms'])).toBe('Terms of Service');
    expect(legalDocumentsPhrase(['privacy', 'terms'])).toBe('Privacy Policy and Terms');
  });
});
