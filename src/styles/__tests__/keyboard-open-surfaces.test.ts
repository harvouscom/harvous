/**
 * Surfaces that must not measure themselves against a viewport the keyboard is covering.
 *
 * Read as stylesheet text rather than rendered, because jsdom has no visual viewport and no
 * software keyboard — there is nothing to render that would tell these rules apart. What must
 * not regress is the shape: a percentage cap that is correct against a full-height box and
 * wrong against a clipped one, and `vh`, which on iOS measures the LARGE viewport and so
 * describes space that is physically behind the keyboard.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const menuPill = readFileSync(resolve(process.cwd(), 'src/styles/harvous-menu-pill.css'), 'utf8');
const protoComponents = readFileSync(
  resolve(process.cwd(), 'spa/src/styles/prototype-components.css'),
  'utf8',
);

describe('the picker sheet with the keyboard up', () => {
  it('keeps the 60% cap for the ordinary, full-height case', () => {
    expect(menuPill).toContain('max-height: min(60%, 420px);');
  });

  it('drops the cap when the backdrop is already only the strip above the keyboard', () => {
    // The backdrop is pinned to the visual viewport, so 60% of it left about two verse rows.
    expect(menuPill).toMatch(
      /\.harvous-menu-pill__sheet\[data-keyboard='open'\]\s*\{[^}]*max-height:\s*100%/,
    );
  });

  it('never reaches for vh, which would measure past the keyboard', () => {
    const sheetBlock = menuPill.slice(
      menuPill.indexOf('.harvous-menu-pill__sheet {'),
      menuPill.indexOf('.harvous-menu-pill__sheet-grabber'),
    );
    expect(sheetBlock).not.toMatch(/\d(?:vh|lvh)\b/);
  });
});

describe('the reader select menu', () => {
  it('caps against the dynamic viewport, with vh only as the fallback declaration', () => {
    const block = protoComponents.slice(
      protoComponents.indexOf('.proto-menu__popover {'),
      protoComponents.indexOf('.proto-menu__popover {') + 1400,
    );
    const vhIndex = block.indexOf('max-height: min(440px, 72vh);');
    const dvhIndex = block.indexOf('max-height: min(440px, 72dvh);');
    expect(vhIndex).toBeGreaterThan(-1);
    expect(dvhIndex).toBeGreaterThan(-1);
    // Order is the whole mechanism: the dvh declaration must win where it is understood.
    expect(dvhIndex).toBeGreaterThan(vhIndex);
  });
});

describe('toolbar hover fills', () => {
  const tiptap = readFileSync(resolve(process.cwd(), 'src/styles/tiptap-editor.css'), 'utf8');
  const protoEditor = readFileSync(
    resolve(process.cwd(), 'spa/src/styles/prototype-editor.css'),
    'utf8',
  );

  /** The rule text between a `@media (hover: hover)` opener and its closing brace. */
  function hoverGuardedRegions(css: string): string {
    const out: string[] = [];
    const opener = /@media \(hover: hover\)[^{]*\{/g;
    let m: RegExpExecArray | null;
    while ((m = opener.exec(css))) {
      let depth = 1;
      let i = m.index + m[0].length;
      const start = i;
      while (i < css.length && depth > 0) {
        if (css[i] === '{') depth++;
        else if (css[i] === '}') depth--;
        i++;
      }
      out.push(css.slice(start, i));
    }
    return out.join('\n');
  }

  it('guards the shared toolbar hover fill behind a real hover capability', () => {
    // iOS leaves :hover stuck on the last-tapped button, and this fill is a shade off the
    // active fill — so unguarded, a tap made a button look toggled on.
    expect(hoverGuardedRegions(tiptap)).toContain('.tiptap-toolbar button:hover:not(:disabled)');
    expect(tiptap).not.toMatch(/^\.tiptap-toolbar button:hover:not\(:disabled\) \{/m);
  });

  it('guards the prototype toolbar hover fill too', () => {
    const guarded = hoverGuardedRegions(protoEditor);
    expect(guarded).toContain('.tiptap-toolbar--prototype-native button:hover:not(:disabled)');
    expect(protoEditor).not.toMatch(
      /^\.proto-editor-bottom-bar \.tiptap-toolbar--prototype-native button:hover/m,
    );
  });

  it('leaves :active alone — press feedback is what a finger actually needs', () => {
    expect(tiptap).toMatch(/^\.tiptap-toolbar button:active:not\(:disabled\) \{/m);
  });
});
