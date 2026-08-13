import { test, expect } from '@playwright/test';

/**
 * No `.proto-marquee` may render zero pixels wide.
 *
 * The class sets `container-type: inline-size`, which zeroes the element's own intrinsic width.
 * It only works where a parent supplies width — a flex or grid track, an explicit basis. Used
 * where the width would have come from the element's own text, it collapses to 0px and renders
 * nothing at all, silently, with the text still sitting in the DOM and still readable to a
 * screen reader. Nothing throws and nothing logs; the label is just gone.
 *
 * That has now happened seven times: the expanded panel title, the planner scope chip's channel
 * name, the scope menu's labels, the board's week-column dates, the compact plan pane, and twice
 * in the planner's paired scope bar. Six of those were found by a person looking at the screen.
 *
 * A static lint cannot catch it — whether a parent supplies width is a layout question, not a
 * syntactic one. So this measures. It walks every scene in the dev galleries and fails on any
 * marquee that has text but no width, which is a state that is never correct.
 *
 * Verified to actually catch the real bug: with the `__room` rule removed from
 * prototype-components.css, the paired scope scene reports two zero-width labels and this fails.
 * A guard nobody has watched fail is not a guard.
 *
 * Run: npm run test:e2e:design-system
 */

const GALLERIES = ['/__dev/design-system', '/__dev/church-design', '/__dev/shared-spaces-design'] as const;

test.describe('Marquee labels have width', () => {
  for (const gallery of GALLERIES) {
    test(`no zero-width marquee in ${gallery}`, async ({ page }) => {
      await page.goto(gallery);
      // The scene list is the left rail. Wait for it rather than racing the first paint.
      await expect(page.locator('button, a').first()).toBeVisible({ timeout: 15_000 });

      const offenders = await page.evaluate(async () => {
        const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
        const scenes = Array.from(document.querySelectorAll('button, a')).filter((el) => {
          const r = el.getBoundingClientRect();
          return r.left < 200 && r.width > 80 && (el.textContent ?? '').trim().length > 3;
        });

        const found: { scene: string; className: string; text: string }[] = [];
        for (const scene of scenes) {
          const label = (scene.textContent ?? '').trim().slice(0, 60);
          (scene as HTMLElement).click();
          // One frame is not enough — the gallery swaps the canvas and the browser needs to
          // lay it out before any width is meaningful.
          await wait(150);
          for (const el of Array.from(document.querySelectorAll('.proto-marquee'))) {
            const text = (el.textContent ?? '').trim();
            if (!text) continue;
            if (el.getBoundingClientRect().width > 0) continue;
            found.push({ scene: label, className: el.className, text: text.slice(0, 40) });
          }
        }
        return found;
      });

      expect(
        offenders,
        offenders.length
          ? `A .proto-marquee rendered 0px wide, so its text is invisible while still being in ` +
            `the DOM. Its parent is sizing to its content, and the marquee has no content width ` +
            `to give. Give the parent a width — a flex basis, or a track that shares one — ` +
            `rather than removing the class:\n` +
            offenders.map((o) => `  [${o.scene}] "${o.text}" — ${o.className}`).join('\n')
          : undefined,
      ).toEqual([]);
    });
  }
});
