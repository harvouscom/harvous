#!/usr/bin/env node
/**
 * Build SPA (unless --skip-build), serve dist-spa with vite preview, run Lighthouse
 * accessibility on a fixed URL list. Exits 1 if any score is below 100%.
 *
 * Usage:
 *   npm run lighthouse:a11y
 *   npm run lighthouse:a11y -- --skip-build
 *
 * Env:
 *   LH_PORT   Preview port (default 4174 — avoids clashing with dev :4322)
 *   LH_URLS   Comma-separated paths, e.g. "/,/sign-in,/dashboard" (default "/,/sign-in")
 */

import { spawn, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import lighthouse from 'lighthouse';
import { launch as launchChrome } from 'chrome-launcher';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PORT = process.env.LH_PORT || '4174';

const pathsFromEnv = process.env.LH_URLS
  ? process.env.LH_URLS.split(',').map((p) => p.trim()).filter(Boolean)
  : ['/', '/sign-in'];

const URLS = pathsFromEnv.map((p) => `http://localhost:${PORT}${p.startsWith('/') ? p : `/${p}`}`);

const skipBuild = process.argv.includes('--skip-build');

function waitForServer(url, maxMs) {
  const deadline = Date.now() + maxMs;
  return (async () => {
    while (Date.now() < deadline) {
      try {
        const r = await fetch(url);
        if (r.ok) return;
      } catch {
        /* retry */
      }
      await new Promise((r) => setTimeout(r, 300));
    }
    throw new Error(`Timeout waiting for ${url}`);
  })();
}

async function main() {
  if (!skipBuild) {
    console.log('[lighthouse:a11y] npm run build:spa …');
    execSync('npm run build:spa', { cwd: ROOT, stdio: 'inherit' });
  }

  const viteBin = join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
  const preview = spawn(process.execPath, [viteBin, 'preview', '--port', PORT, '--strictPort'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  });

  let previewExited = false;
  preview.on('exit', () => {
    previewExited = true;
  });

  const killPreview = () => {
    if (!previewExited && preview.pid) {
      try {
        preview.kill('SIGTERM');
      } catch {
        /* ignore */
      }
    }
  };

  process.on('SIGINT', () => {
    killPreview();
    process.exit(130);
  });

  try {
    await waitForServer(`http://localhost:${PORT}/`, 90000);

    const chrome = await launchChrome({
      chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu'],
    });

    try {
      let failed = false;
      for (const url of URLS) {
        console.log('[lighthouse:a11y] Auditing', url);
        const runnerResult = await lighthouse(url, {
          logLevel: 'error',
          onlyCategories: ['accessibility'],
          port: chrome.port,
        });
        const score = runnerResult.lhr.categories.accessibility.score;
        const pct = score == null ? null : Math.round(score * 100);
        console.log(`  accessibility: ${pct}`);
        if (score != null && score < 1) {
          console.error(`  FAIL: ${url} scored ${pct} (need 100)`);
          failed = true;
        }
      }
      if (failed) {
        process.exitCode = 1;
        return;
      }
    } finally {
      await chrome.kill();
    }
  } finally {
    killPreview();
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log('[lighthouse:a11y] All accessibility scores are 100.');
}

main().catch((e) => {
  console.error('[lighthouse:a11y]', e);
  process.exit(1);
});
