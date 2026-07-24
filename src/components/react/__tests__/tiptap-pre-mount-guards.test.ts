import { describe, expect, it } from 'vitest';
import {
  absorbOrphanSuffixesAfterPills,
  applyDefaultTranslationToScripturePills,
  consumeTrailingTranslationAfterPills,
} from '../TiptapEditor';

function preMountEditor() {
  return {
    isDestroyed: false,
    state: { doc: { content: { size: 0 } } },
    get view() {
      throw new Error('[tiptap error]: The editor view is not available. Cannot access view[\'dom\']');
    },
  };
}

describe('TipTap pre-mount view guards', () => {
  it('absorbOrphanSuffixesAfterPills no-ops without throwing', () => {
    const editor = preMountEditor();
    expect(() => absorbOrphanSuffixesAfterPills(editor)).not.toThrow();
    expect(absorbOrphanSuffixesAfterPills(editor)).toBe(false);
  });

  it('applyDefaultTranslationToScripturePills no-ops without throwing', () => {
    const editor = preMountEditor();
    expect(() => applyDefaultTranslationToScripturePills(editor, 'NASB')).not.toThrow();
    expect(applyDefaultTranslationToScripturePills(editor, 'NASB')).toBe(false);
  });

  it('consumeTrailingTranslationAfterPills no-ops without throwing', () => {
    const editor = preMountEditor();
    expect(() => consumeTrailingTranslationAfterPills(editor)).not.toThrow();
    expect(consumeTrailingTranslationAfterPills(editor)).toBe(false);
  });
});
