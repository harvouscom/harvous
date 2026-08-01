import { describe, expect, it } from 'vitest';
import {
  absorbOrphanSuffixesAfterPills,
  applyDefaultTranslationToScripturePills,
  consumeTrailingTranslationAfterPills,
} from '../TiptapEditor';

/**
 * Models `@tiptap/core`'s real `Editor.view` getter before the view mounts —
 * a `Proxy` that safely stubs `state`/`dispatch`/`updateState`/`composing`/
 * `dragging`/`editable`/`isDestroyed`, and throws only for any other key
 * (e.g. `.dom`), exactly matching `Editor.ts`'s own proxy trap. Merely
 * reading `.view` — or any of its stubbed properties — must never throw;
 * only an unstubbed access like `.view.dom` does. A cruder fixture that
 * makes `.view` itself throw unconditionally doesn't match reality and
 * fails these guards even though they only ever touch the safe subset.
 */
function preMountEditor() {
  const state = { doc: { content: { size: 0 } }, schema: { marks: {} } };
  return {
    isDestroyed: false,
    state,
    get view() {
      return new Proxy(
        { state, updateState: () => {}, dispatch: () => {}, composing: false, dragging: null, editable: true, isDestroyed: false },
        {
          get(obj, key) {
            if (key in obj) return Reflect.get(obj, key);
            throw new Error(
              `[tiptap error]: The editor view is not available. Cannot access view['${String(key)}']. The editor may not be mounted yet.`,
            );
          },
        },
      );
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
