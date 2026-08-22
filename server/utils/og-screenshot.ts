/**
 * Capture a 1200×630 PNG of a public share page for Open Graph.
 *
 * Fly (long-lived process): system Chromium via CHROME_EXECUTABLE_PATH, and the
 * browser is kept alive between renders — booting one per request cost several
 * seconds and is the single largest slice of a render.
 *
 * Netlify function (still the production path until the /api/* cutover):
 * puppeteer-core + @sparticuz/chromium, one browser per invocation as before.
 * Reuse is deliberately not applied there — the process is short-lived, and
 * changing behavior on the host currently serving production is not worth the
 * risk during the migration.
 *
 * Failure contract: this throws rather than returning a placeholder. Callers
 * (server/routes/og.ts) turn that into a 404 with X-Og-Source: none, because a
 * wrong preview image is worse than none.
 */

import puppeteer, { type Browser } from 'puppeteer-core';

const OG_SHOT_WIDTH = 1200;
const OG_SHOT_HEIGHT = 630;

/**
 * Concurrent renders. One, deliberately: measured on the 1GB machine, an idle
 * retained browser already leaves only ~300MB available, and each additional
 * page holds its own renderer process. OG rendering is crawler traffic, not a
 * hot path — queueing is cheaper than an OOM kill that takes the API with it.
 */
const MAX_CONCURRENT_RENDERS = 1;

/**
 * Relaunch the browser after this many renders. Long-lived Chromium leaks
 * slowly; recycling bounds RSS without anyone having to watch it.
 */
const RENDERS_BEFORE_RECYCLE = 100;

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
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      // Trim what a screenshot-only browser never needs. Matters on a 1GB
      // machine where the browser is now resident rather than per-request.
      '--disable-gpu',
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-default-apps',
      '--disable-sync',
      '--metrics-recording-only',
      '--mute-audio',
      '--no-first-run',
      '--hide-scrollbars',
    ],
  });
}

/**
 * Warm the render path at startup so the first crawler does not pay for it.
 *
 * Measured cold: ~34s, against ~2.5s warm — that is Chromium's first boot plus
 * the first uncached fetch and parse of the SPA bundle. A throwaway render at
 * boot moves all of it off the request path. `pageUrl` should be a well-formed
 * but unknown share URL, which renders the error card through the same code.
 *
 * Never throws: warming is an optimization, not a startup requirement.
 */
export async function prewarmOgRenderer(pageUrl: string): Promise<void> {
  if (isServerlessRuntime()) return;
  // Log on entry as well as exit: a warm takes ~34s, so without this an absent
  // completion line is ambiguous between skipped, still running, and died.
  console.log('[og-screenshot] prewarm starting');
  const startedAt = Date.now();
  try {
    await captureShareOgScreenshot(pageUrl);
    console.log(`[og-screenshot] prewarm ok in ${Date.now() - startedAt}ms`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[og-screenshot] prewarm failed after ${Date.now() - startedAt}ms:`, message);
  }
}

// ─── Retained browser (non-serverless only) ──────────────────────────────────

let browserPromise: Promise<Browser> | null = null;
let rendersOnCurrentBrowser = 0;

async function getRetainedBrowser(): Promise<Browser> {
  if (browserPromise) {
    const existing = await browserPromise.catch(() => null);
    if (existing?.connected && rendersOnCurrentBrowser < RENDERS_BEFORE_RECYCLE) {
      return existing;
    }
    // Crashed, disconnected, or due for recycling. Closing is best-effort; a
    // dead browser cannot be closed and must not block the relaunch.
    browserPromise = null;
    rendersOnCurrentBrowser = 0;
    if (existing) await existing.close().catch(() => {});
  }

  const launching = launchBrowser();
  browserPromise = launching;
  try {
    return await launching;
  } catch (error) {
    // Never cache a failed launch — the next request should retry.
    if (browserPromise === launching) browserPromise = null;
    throw error;
  }
}

// ─── Render concurrency ──────────────────────────────────────────────────────

let activeRenders = 0;
const waiting: Array<() => void> = [];

function acquireRenderSlot(): Promise<void> {
  if (activeRenders < MAX_CONCURRENT_RENDERS) {
    activeRenders++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    waiting.push(() => {
      activeRenders++;
      resolve();
    });
  });
}

function releaseRenderSlot(): void {
  activeRenders--;
  waiting.shift()?.();
}

/**
 * Screenshot the top of a public share URL (pass ?ogCapture=1 for clean chrome).
 */
export async function captureShareOgScreenshot(pageUrl: string): Promise<Buffer> {
  await acquireRenderSlot();

  // Everything past the acquire must run inside this try, including obtaining
  // the browser: a throw there would otherwise leak the slot, and after
  // MAX_CONCURRENT_RENDERS failures the route would wedge for good.
  try {
    const reuseBrowser = !isServerlessRuntime();
    const browser = reuseBrowser ? await getRetainedBrowser() : await launchBrowser();
    if (reuseBrowser) rendersOnCurrentBrowser++;

    try {
      const page = await browser.newPage();
      try {
        await page.setViewport({
          width: OG_SHOT_WIDTH,
          height: OG_SHOT_HEIGHT,
          deviceScaleFactor: 1,
        });

        // Emulate a normal browser so edge bot-rewrite does not intercept.
        await page.setUserAgent(
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 HarvousOgCapture/1.0',
        );

        // domcontentloaded, not networkidle2: the SPA keeps connections busy
        // well past the point the card is on screen, and waitForSelector below
        // is the real readiness signal.
        await page.goto(pageUrl, {
          waitUntil: 'domcontentloaded',
          timeout: 25_000,
        });

        await page.waitForSelector(
          '.public-paper-stack, .public-card, .public-error-card, .public-content',
          { timeout: 15_000 },
        );

        // Webfonts settle. Waiting on the font set beats a blind sleep — it
        // returns as soon as the faces are ready instead of always costing
        // 400ms, and it is correct on a slow render where 400ms was not.
        await page
          .evaluate(() => document.fonts.ready.then(() => undefined))
          .catch(() => {});

        const png = await page.screenshot({
          type: 'png',
          clip: { x: 0, y: 0, width: OG_SHOT_WIDTH, height: OG_SHOT_HEIGHT },
          captureBeyondViewport: false,
        });

        return Buffer.from(png);
      } finally {
        await page.close().catch(() => {});
      }
    } finally {
      if (!reuseBrowser) await browser.close().catch(() => {});
    }
  } finally {
    releaseRenderSlot();
  }
}
