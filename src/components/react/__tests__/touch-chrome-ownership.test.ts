/**
 * Who owns the bottom chrome on a touch device, and what must never float.
 *
 * These are source assertions, and deliberately so: the behaviour they guard only appears with
 * a coarse pointer, an expanded study dock, and a live selection at once, which is three pieces
 * of state jsdom cannot put on screen together in a way that would prove anything. What CAN
 * regress silently is the shape of the conditions, and that is what is checked here — each of
 * these bugs was a plausible-looking boolean.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/components/react/TiptapEditor.tsx'), 'utf8');

function block(startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  expect(start, `missing marker: ${startMarker}`).toBeGreaterThan(-1);
  const end = source.indexOf(endMarker, start);
  return source.slice(start, end > -1 ? end : start + 2000);
}

describe('selection actions on touch', () => {
  const decl = block('const selectionActionsInChromeBar =', ';\n');

  it('does not stand down for an expanded dock', () => {
    // It used to. The dock owning the chrome is the right reason to hide the format tools and
    // the wrong reason to hide the selection row, which acts on what the user is looking at.
    expect(decl).not.toContain('!studyDockChromeTakesOver');
  });

  it('still requires touch and a real host to portal into', () => {
    expect(decl).toContain('isCoarsePointer');
    expect(decl).toContain('!!formatToolbarPortalTarget');
  });

  it('outranks the dock when the chrome mode is chosen', () => {
    const effect = block("if (selectionActionsInChromeBar) {", 'onPrototypeChromeModeChange(');
    // Ordering is the mechanism: the dock's 'hidden' branch must come after, or it returns first.
    const selectionIdx = source.indexOf("if (selectionActionsInChromeBar) {\n      onPrototypeChromeModeChange('selection')");
    const dockIdx = source.indexOf("if (studyDockChromeTakesOver) {\n      onPrototypeChromeModeChange('hidden')");
    expect(selectionIdx).toBeGreaterThan(-1);
    expect(dockIdx).toBeGreaterThan(-1);
    expect(selectionIdx).toBeLessThan(dockIdx);
    expect(effect).toBeTruthy();
  });

  it('never draws the floating capsule on a touch device', () => {
    // ScripturePillChromeWeb refuses to for the same reason: it lands on the iOS callout.
    expect(source).toContain('const selectionBarSuppressedOnTouch =');
    expect(block('const selectionBar =', '<SelectionBarShell')).toContain('!selectionBarSuppressedOnTouch');
  });

  it('keeps formatting available alongside selection actions in editable notes', () => {
    const formatCondition = block('const shouldShowPrototypeFormatToolbar =', ';\n');
    expect(formatCondition).toContain('formatToolbarEngaged || selectionActionsInChromeBar');
    expect(formatCondition).not.toContain('!selectionActionsInChromeBar');
    expect(source).toContain('{selectionActionsInFormatToolbar && selectionBar}');
  });
});

describe('inline targets that own their own tap', () => {
  it('opens inline targets only after a completed touch', () => {
    const set = block('const inlineTargetSelector =', ';\n');
    expect(set).toContain('.scripture-pill');
    expect(set).toContain('.reference-suggestion');
    expect(set).toContain('.mention-pill');
    const start = block('const handlePillTouchStart =', 'const clearPillTouch =');
    const end = block('const handlePillTouchEnd =', 'const focusEditorAtTapFallback =');
    expect(start).not.toContain('handlePillPointer(e)');
    expect(end).toContain('withinTapSlop');
    expect(end).toContain('maxTapDuration');
    expect(end).toContain('handlePillPointer(e)');
  });
});

describe('toolbar button identity', () => {
  it('is held across renders, or every button remounts per keystroke', () => {
    expect(source).toContain('const ToolbarButton = useCallback(');
    expect(source).toContain('const PrototypeToolbarButton = useCallback(');
  });

  it('keeps one track identity on touch instead of replaying the enter animation', () => {
    expect(source).toContain("const toolbarTrackKey = isCoarsePointer ? 'touch' : toolbarEnterEpoch;");
    expect(source).not.toContain('key={toolbarEnterEpoch}');
  });
});
