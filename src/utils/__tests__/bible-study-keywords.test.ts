import { describe, expect, it } from 'vitest';

import { findKeywordsInText, findKeywordsInTextWithPriority } from '@/utils/bible-study-keywords';
import { suggestPrimaryCollectionFromNote } from '@/utils/bible-study-collection-web';

describe('bible study keyword boundaries (Hell vs Hello)', () => {
  it('findKeywordsInTextWithPriority does not match Hell inside Hello world', () => {
    const title = 'Hello world';
    const body =
      'This is a new note talking about [1 John 2:3 NET] and seeing what all happens here';
    const full = `${title}\n${body}`;
    const rows = findKeywordsInTextWithPriority(full, title, body);
    expect(rows.some(r => r.keyword.name === 'Hell')).toBe(false);
  });

  it('findKeywordsInTextWithPriority matches Hell as a word', () => {
    const title = '';
    const body = 'This note mentions hell as a theological topic.';
    const full = body;
    const rows = findKeywordsInTextWithPriority(full, title, body);
    expect(rows.some(r => r.keyword.name === 'Hell')).toBe(true);
  });

  it('Hell matches synonym gehenna (whole-word)', () => {
    const text = 'We read about gehenna in Scripture.';
    const rows = findKeywordsInText(text);
    expect(rows.some(r => r.keyword.name === 'Hell')).toBe(true);
  });

  it('Hell matches multi-word synonym eternal punishment (phrase boundary)', () => {
    const title = '';
    const body = 'A warning about eternal punishment appears in teaching.';
    const full = body;
    const rows = findKeywordsInTextWithPriority(full, title, body);
    expect(rows.some(r => r.keyword.name === 'Hell')).toBe(true);
  });

  it('suggestPrimaryCollectionFromNote does not surface Hell from Hello-only title', () => {
    const suggested = suggestPrimaryCollectionFromNote('Hello world', '');
    expect(suggested).not.toBe('Hell');
  });
});
