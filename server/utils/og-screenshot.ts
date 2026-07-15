/**
 * Capture a 1200×630 PNG of a public share page for Open Graph.
 *
 * Production (Netlify og-image function): puppeteer-core + @sparticuz/chromium
 * Local (Hono / tsx): system Chrome via CHROME_EXECUTABLE_PATH or platform default
 */

import puppeteer, { type Browser } from 'puppeteer-core';

/** Keep local to avoid pulling satori/ultrahtml into the screenshot module. */
const OG_SHOT_WIDTH = 1200;
const OG_SHOT_HEIGHT = 630;

function isServerlessRuntime(): boolean {
  return !!(
    process.env.NETLIFY ||
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.AWS_EXECUTION_ENV
  );
}

async function launchBrowser(): Promise<Browser> {
  if (isServerlessRuntime()) {
    const chromium = (await import('@sparticuz/chromium')).default;
    return puppeteer.launch({
      args: chromium.args,
      defaultViewport: {
        width: OG_SHOT_WIDTH,
        height: OG_SHOT_HEIGHT,
        deviceScaleFactor: 1,
      },
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });
  }

  const executablePath =
    process.env.CHROME_EXECUTABLE_PATH ||
    process.env.PUPPETEER_EXECUTABLE_PATH ||
    (process.platform === 'darwin'
      ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
      : process.platform === 'linux'
        ? '/usr/bin/google-chrome'
        : 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe');

  return puppeteer.launch({
    executablePath,
    headless: true,
    defaultViewport: {
      width: OG_SHOT_WIDTH,
      height: OG_SHOT_HEIGHT,
      deviceScaleFactor: 1,
    },
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
}

/**
 * Screenshot the top of a public share URL (pass ?ogCapture=1 for clean chrome).
 */
export async function captureShareOgScreenshot(pageUrl: string): Promise<Buffer> {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setViewport({
      width: OG_SHOT_WIDTH,
      height: OG_SHOT_HEIGHT,
      deviceScaleFactor: 1,
    });

    // Emulate a normal browser so edge bot-rewrite does not intercept.
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 HarvousOgCapture/1.0',
    );

    await page.goto(pageUrl, {
      waitUntil: 'networkidle2',
      timeout: 25_000,
    });

    await page.waitForSelector(
      '.public-paper-stack, .public-card, .public-error-card, .public-content',
      { timeout: 15_000 },
    );

    // Let webfonts / layout settle
    await new Promise((r) => setTimeout(r, 400));

    const png = await page.screenshot({
      type: 'png',
      clip: { x: 0, y: 0, width: OG_SHOT_WIDTH, height: OG_SHOT_HEIGHT },
      captureBeyondViewport: false,
    });

    return Buffer.from(png);
  } finally {
    await browser.close().catch(() => {});
  }
}
