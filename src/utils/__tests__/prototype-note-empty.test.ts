import { describe, expect, it } from 'vitest';
import {
  isEffectivelyEmptyPrototypeNote,
  isTiptapBodyEmpty,
  normalizeEmptyBodyHtmlForEditor,
  preferredCaretPosForEmptyDoc,
} from '../prototype-note-empty';

describe('isTiptapBodyEmpty', () => {
  it('treats empty and paragraph-only HTML as empty', () => {
    expect(isTiptapBodyEmpty('')).toBe(true);
    expect(isTiptapBodyEmpty('<p></p>')).toBe(true);
    expect(isTiptapBodyEmpty('<p><br></p>')).toBe(true);
  });

  it('detects non-empty body text', () => {
    expect(isTiptapBodyEmpty('<p>Hello</p>')).toBe(false);
  });
});

describe('normalizeEmptyBodyHtmlForEditor', () => {
  it('uses true empty paragraph for empty bodies', () => {
    expect(normalizeEmptyBodyHtmlForEditor('')).toBe('<p></p>');
    expect(normalizeEmptyBodyHtmlForEditor('<p></p>')).toBe('<p></p>');
    expect(normalizeEmptyBodyHtmlForEditor('<p><br></p>')).toBe('<p></p>');
  });

  it('canonicalizes non-empty bodies including internal blank lines', () => {
    expect(normalizeEmptyBodyHtmlForEditor('<p>hi</p>')).toBe('<p>hi</p>');
    expect(normalizeEmptyBodyHtmlForEditor('<p>one</p><p></p><p>two</p>')).toBe(
      '<p>one</p><p><br></p><p>two</p>',
    );
  });

  it('strips empty paragraphs adjacent to hr on hydrate', () => {
    expect(normalizeEmptyBodyHtmlForEditor('<p>Above</p><p></p><hr><p><br></p><p>Below</p>')).toBe(
      '<p>Above</p><hr><p>Below</p>',
    );
  });
});

describe('preferredCaretPosForEmptyDoc', () => {
  it('returns start of first block', () => {
    expect(preferredCaretPosForEmptyDoc({ textContent: '' })).toBe(1);
  });
});

describe('isEffectivelyEmptyPrototypeNote', () => {
  it('treats server untitled pattern with empty body as empty', () => {
    expect(isEffectivelyEmptyPrototypeNote('Untitled Note 3', '<p></p>')).toBe(true);
  });

  it('is not empty when title or body has user content', () => {
    expect(isEffectivelyEmptyPrototypeNote('', '<p>Notes</p>')).toBe(false);
    expect(isEffectivelyEmptyPrototypeNote('My study', '<p></p>')).toBe(false);
  });
});
