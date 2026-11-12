// Renders banner.html at the two sizes Epic has asked for: 720 x 250 (KWS Branding docs) and
// 1280 x 720 (the portal's minimum for some uploads). Usage: node docs/brand/kws/render.mjs
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const sizes = [[720, 250], [1280, 720]];
const browser = await chromium.launch();
try {
  for (const [width, height] of sizes) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    await page.goto(`file://${join(here, 'banner.html')}`);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: join(here, `kws-banner-${width}x${height}.png`), clip: { x: 0, y: 0, width, height } });
    await page.close();
  }
} finally {
  await browser.close();
}
