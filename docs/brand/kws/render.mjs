// Renders banner.html to kws-banner-720x250.png at exactly 720 x 250 (KWS rejects any other size).
// Usage: node docs/brand/kws/render.mjs
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 720, height: 250 }, deviceScaleFactor: 1 });
  await page.goto(`file://${join(here, 'banner.html')}`);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(here, 'kws-banner-720x250.png'), clip: { x: 0, y: 0, width: 720, height: 250 } });
} finally {
  await browser.close();
}
