import { describe, expect, it } from 'vitest';

import { findKeywordsInText, findKeywordsInTextWithPriority } from '@/utils/bible-study-keywords';
import {
  suggestPrimaryCollectionFromNote,
  suggestSecondaryCollectionsFromNote,
} from '@/utils/bible-study-collection-web';

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

  it('suggestPrimaryCollectionFromNote prefers title theme over incidental character in body', () => {
    const title = 'Prayer in the morning';
    const body =
      'We gather for prayer today. We ask for strength and guidance. '.repeat(8) +
      'We read briefly about David and return to petition.';
    const primary = suggestPrimaryCollectionFromNote(title, body);
    expect(primary).toBe('Prayer');
  });

  it('suggestSecondaryCollectionsFromNote omits weak single-mention character folders', () => {
    const title = 'Notes on forgiveness';
    const body =
      'Forgiveness is central to the gospel message. Mercy flows from the cross. '.repeat(6) +
      'Someone mentioned David once in passing.';
    const secs = suggestSecondaryCollectionsFromNote(title, body, 'Forgiveness');
    expect(secs.some((s) => s.toLowerCase() === 'david')).toBe(false);
  });
});

describe('auto folder exclusions (God / Jesus / Holy Spirit)', () => {
  const devotionalBody =
    'We trust in the Lord Jesus Christ and the Holy Spirit guides us. God is faithful and good. '.repeat(
      8,
    );

  it('suggestPrimaryCollectionFromNote does not surface God, Jesus, or Holy Spirit', () => {
    const primary = suggestPrimaryCollectionFromNote('God is good', devotionalBody);
    expect(primary?.toLowerCase()).not.toBe('god');
    expect(primary?.toLowerCase()).not.toBe('jesus');
    expect(primary?.toLowerCase()).not.toBe('holy spirit');
  });

  it('suggestSecondaryCollectionsFromNote omits God, Jesus, and Holy Spirit', () => {
    const secs = suggestSecondaryCollectionsFromNote('Morning prayer', devotionalBody, 'Prayer');
    const lower = secs.map((s) => s.toLowerCase());
    expect(lower).not.toContain('god');
    expect(lower).not.toContain('jesus');
    expect(lower).not.toContain('holy spirit');
  });
});
