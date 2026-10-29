import { expect, test, type Page } from '@playwright/test';
import { stubGuestApi } from './fixtures/guest-api-stub';

/**
 * Scripture pills in a guest note, on WebKit at an iPhone size.
 *
 * Runs from `playwright.webkit.config.ts` — guest mode (`/?try=1`), no Clerk, nothing saved to the
 * server. The iPhone 15 device profile sends an iOS user agent, so `isMobileDevice()` is true and
 * the editor takes its mobile paths: a typed reference becomes a dashed draft, and commits on the
 * ✓, Enter, or the caret leaving it — never on the space itself.
 *
 * Desktop WebKit has no on-screen keyboard and paints its own caret, so where the iOS behaviour
 * is about the painted caret these specs assert ProseMirror's document and selection instead.
 */

type Run = { text: string; marks: string[]; reference?: string };
type EditorSnapshot = { runs: Run[]; from: number; to: number };

async function openGuestNote(page: Page) {
  await stubGuestApi(page);
  await page.goto('/?try=1');
  await page.getByRole('button', { name: 'New note in My Home' }).click();
  const editor = page.locator('.ProseMirror').first();
  await expect(editor).toBeVisible();
  // `.proto-blank-note-scan` sits over a blank note and takes the pointer, so focus directly
  // rather than clicking into the body.
  await editor.focus();
  await expect.poll(() => page.evaluate(() => document.activeElement?.classList.contains('ProseMirror'))).toBe(true);
  return editor;
}

/** The first paragraph's text runs with their mark names, plus the PM selection. */
function snapshot(page: Page): Promise<EditorSnapshot> {
  return page.evaluate(() => {
    const editor = (document.querySelector('.ProseMirror') as any).editor;
    const para = editor.state.doc.firstChild;
    const runs: Run[] = [];
    para?.forEach((node: any) => {
      runs.push({
        text: node.text ?? '',
        marks: node.marks.map((m: any) => m.type.name),
        reference: node.marks.find((m: any) => m.type.name === 'scripturePill')?.attrs.reference,
      });
    });
    const { from, to } = editor.state.selection;
    return { runs, from, to };
  });
}

function runWith(snap: EditorSnapshot, mark: string): Run | undefined {
  return snap.runs.find((r) => r.marks.includes(mark));
}

/** Type a reference, then commit it with the floating ✓ — the route a phone user takes. */
async function typeAndConfirmPill(page: Page, reference: string) {
  await page.keyboard.type(`${reference} `, { delay: 30 });
  await expect.poll(async () => runWith(await snapshot(page), 'scriptureDraft')?.text).toBe(reference);
  await page.getByRole('button', { name: 'Confirm scripture reference' }).click();
  await expect.poll(async () => runWith(await snapshot(page), 'scripturePill')?.reference).toBe(reference);
}

test.describe('guest editor scripture pills (WebKit iPhone)', () => {
  test('a typed reference becomes a draft, then a pill on ✓', async ({ page }, testInfo) => {
    const editor = await openGuestNote(page);
    await typeAndConfirmPill(page, 'Exodus 32:1-35');

    const snap = await snapshot(page);
    expect(snap.runs.some((r) => r.marks.includes('scriptureDraft'))).toBe(false);
    await expect(editor.locator('span.scripture-pill[data-scripture-reference="Exodus 32:1-35"]')).toBeVisible();
    // The caret sits after the pill's trailing spacer, not inside the pill.
    expect(snap.from).toBe(snap.to);
    expect(snap.from).toBeGreaterThan('Exodus 32:1-35'.length);

    const path = testInfo.outputPath('pill.png');
    await page.screenshot({ path });
    await testInfo.attach('pill', { path, contentType: 'image/png' });
  });

  test('typing on after the space commits the pill and keeps the words in order', async ({ page }) => {
    // KNOWN BUG — the first letter typed after "reference + space" jumps to the end of what follows
    // ("and more" lands as " nd morea"). On mobile the draft commits from `selectionUpdate` once
    // that letter detaches the caret (TiptapEditor.tsx:7658), and `confirmScriptureDraftView`
    // then collapses the selection to just after the pill's spacer
    // (TiptapScriptureDraft.ts:1153) — before the letter that triggered the commit, rather
    // than mapping the caret the user already had. Reproduces in Chromium at an iOS user agent too, at any
    // typing speed. Remove `test.fail` once fixed.
    test.fail();
    await openGuestNote(page);
    await page.keyboard.type('Exodus 32:1-35 ', { delay: 30 });
    await expect.poll(async () => runWith(await snapshot(page), 'scriptureDraft')?.text).toBe('Exodus 32:1-35');
    await page.keyboard.type('and more', { delay: 80 });

    await expect.poll(async () => runWith(await snapshot(page), 'scripturePill')?.reference).toBe('Exodus 32:1-35');
    const snap = await snapshot(page);
    expect(snap.runs.map((r) => r.text).join('')).toBe('Exodus 32:1-35 and more');
  });

  test('ArrowLeft crosses the pill in one press', async ({ page }) => {
    await openGuestNote(page);
    await typeAndConfirmPill(page, 'Exodus 32:1-35');
    const before = await snapshot(page);
    const pillStart = 1; // first position inside the paragraph

    await page.keyboard.press('ArrowLeft');
    const after = await snapshot(page);
    expect(after.from, `caret moved from ${before.from}`).toBe(pillStart);
    expect(after.to).toBe(pillStart);
    // Crossing must not touch the pill.
    expect(runWith(after, 'scripturePill')?.reference).toBe('Exodus 32:1-35');

    // And back across in one press.
    await page.keyboard.press('ArrowRight');
    expect((await snapshot(page)).from).toBeGreaterThan(pillStart + 'Exodus 32:1-35'.length - 1);
  });

  test('Backspace after a pill turns it back into an editable draft', async ({ page }) => {
    const editor = await openGuestNote(page);
    await typeAndConfirmPill(page, 'Exodus 32:1-35');

    await page.keyboard.press('Backspace');
    const snap = await snapshot(page);
    expect(runWith(snap, 'scripturePill')).toBeUndefined();
    expect(runWith(snap, 'scriptureDraft')?.text).toBe('Exodus 32:1-35');
    // Nothing was deleted — the first Backspace only changes mode.
    expect(snap.runs.map((r) => r.text).join('').trim()).toBe('Exodus 32:1-35');
    await expect(editor.locator('span.scripture-pill-draft')).toBeVisible();

    // A second Backspace edits the reference text itself.
    await page.keyboard.press('Backspace');
    const edited = await snapshot(page);
    expect(edited.runs.map((r) => r.text).join('').trim()).toBe('Exodus 32:1-3');
  });

  test('pasting text with a reference turns the reference into a pill', async ({ page }) => {
    const editor = await openGuestNote(page);
    // A synthetic paste: WebKit gates the async clipboard behind a user permission, and
    // ProseMirror only reads `event.clipboardData`, so a constructed event exercises the same path.
    await editor.evaluate((el) => {
      const data = new DataTransfer();
      data.setData('text/plain', 'Moses came down in Exodus 32:15-20 and saw the calf.');
      el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
    });

    await expect.poll(async () => (await snapshot(page)).runs.map((r) => r.text).join('')).toContain('saw the calf.');
    await expect
      .poll(async () => runWith(await snapshot(page), 'scripturePill')?.reference, { timeout: 5_000 })
      .toBe('Exodus 32:15-20');
    const text = (await snapshot(page)).runs.map((r) => r.text).join('');
    expect(text).toMatch(/^Moses came down in Exodus 32:15-20\s+and saw the calf\.$/);
  });
});
