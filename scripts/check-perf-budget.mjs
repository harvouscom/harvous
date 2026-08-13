#!/usr/bin/env node
/**
 * Bundle budget ratchet.
 *
 * The SPA's initial payload is every asset `dist-spa/index.html` declares up front — the
 * entry script, its `modulepreload` siblings, and the stylesheet. That is what a user waits
 * for on *every* route, including sign-in, before anything paints.
 *
 * Nothing measured it, and it grew. `docs/route-based-code-splitting.md` was written when
 * the main chunk was 1.6 MB and set out a plan to shrink it; by the time this check was
 * added it was 2.53 MB. A documented number with no gate is a number that goes up.
 *
 * Two real defects this exists to catch, both invisible without it:
 *
 *   - `vite.config.ts` asks for React in a `react-vendor` chunk. Rollup emitted a 1-byte
 *     file and shipped React inside the main bundle instead. The config looked right, the
 *     build succeeded, and the split silently never happened. See `checkNamedChunks`.
 *   - TipTap (116 KB gzipped) is `modulepreload`ed on every route for an editor only note
 *     routes use.
 *
 * Like `check-typecheck-baseline.mjs`, this is a ratchet rather than a fixed target: it
 * fails when a chunk or the initial payload grows past its recorded budget. Shrinking is
 * always allowed and is reported so you can lock it in. Run with --update after a genuine
 * improvement, or when a deliberate addition justifies more bytes.
 *
 * Usage:
 *   node scripts/check-perf-budget.mjs            # check (needs a built dist-spa/)
 *   node scripts/check-perf-budget.mjs --update   # rewrite the baseline
 */

import { readFileSync, writeFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(here);
const DIST = join(ROOT, 'dist-spa');
const INDEX_HTML = join(DIST, 'index.html');
const BUDGET_PATH = join(here, 'perf-budget.json');
const VITE_CONFIG = join(ROOT, 'vite.config.ts');

const shouldUpdate = process.argv.includes('--update');

/**
 * Growth headroom before a chunk is called a regression. Content hashes and minifier
 * output drift by a few bytes on almost any edit, so an exact-or-lower rule would fail
 * constantly and get switched off. 1% catches "someone added a library" (the failure worth
 * catching) while ignoring "someone renamed a variable". Small chunks get an absolute
 * floor instead, since 1% of 14 KB is noise-sized.
 */
const TOLERANCE_RATIO = 0.01;
const TOLERANCE_FLOOR_BYTES = 2048;

function allowedFor(budgetBytes) {
  return budgetBytes + Math.max(TOLERANCE_FLOOR_BYTES, Math.round(budgetBytes * TOLERANCE_RATIO));
}

function kb(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

/**
 * `index-Dt472JbO.js` -> `index.js`, so a budget survives every rebuild's new hash.
 *
 * The count is exactly 8 (Vite's default hash length) and anchored to the end on purpose.
 * An open-ended `{8,}` matches from the *first* hyphen, which turns `react-vendor-l0sNRNKZ.js`
 * into `react.js` and `admin-usage-trends-chart-zsKMLcHX.js` into `admin.js` — every
 * hyphenated chunk collapses to its first word and the budget keys collide. Hashes are
 * base64url, so the class has to keep `-` and `_` for the ~20% of hashes that contain one.
 */
function stableName(file) {
  return basename(file).replace(/-[A-Za-z0-9_-]{8}(\.[a-z]+)$/, '$1');
}

/**
 * The assets index.html asks for before it can paint: the entry `<script src>`, every
 * `rel="modulepreload"`, and every `rel="stylesheet"`. Anything loaded later (a lazy route
 * chunk) is deliberately not counted — this budget is about first paint, not total weight.
 */
function readInitialPayload() {
  const html = readFileSync(INDEX_HTML, 'utf8');
  const refs = new Set();

  for (const m of html.matchAll(/<script[^>]+src="(\/assets\/[^"]+)"/g)) refs.add(m[1]);
  for (const m of html.matchAll(/<link[^>]+rel="(?:modulepreload|stylesheet)"[^>]+href="(\/assets\/[^"]+)"/g)) {
    refs.add(m[1]);
  }
  // `rel` and `href` appear in either order depending on what emitted the tag.
  for (const m of html.matchAll(/<link[^>]+href="(\/assets\/[^"]+)"[^>]+rel="(?:modulepreload|stylesheet)"/g)) {
    refs.add(m[1]);
  }

  return [...refs].map((ref) => {
    const abs = join(DIST, ref.replace(/^\//, ''));
    if (!existsSync(abs)) throw new Error(`index.html references ${ref} but ${abs} does not exist`);
    return { name: stableName(abs), gzip: gzipSync(readFileSync(abs)).length, raw: statSync(abs).size };
  });
}

/**
 * A `manualChunks` entry that produces an empty file means the split silently didn't
 * happen and its modules went into the main bundle instead — the react-vendor bug. Rollup
 * still emits a placeholder, so the build looks fine.
 */
function checkNamedChunks(problems) {
  if (!existsSync(VITE_CONFIG)) return;
  const config = readFileSync(VITE_CONFIG, 'utf8');
  const block = config.match(/manualChunks\s*:\s*\{([\s\S]*?)\n\s*\}/);
  if (!block) return;

  const names = [...block[1].matchAll(/^\s*'([^']+)'\s*:/gm)].map((m) => m[1]);
  const assets = readdirSync(join(DIST, 'assets'));

  for (const name of names) {
    const match = assets.find((f) => f.endsWith('.js') && stableName(f) === `${name}.js`);
    if (!match) {
      problems.push(`manualChunks declares '${name}' but no ${name}-*.js was emitted`);
      continue;
    }
    const size = statSync(join(DIST, 'assets', match)).size;
    if (size < 100) {
      problems.push(
        `manualChunks '${name}' produced an effectively empty chunk (${size} bytes) — ` +
          `its modules were bundled elsewhere, so the split is not happening`,
      );
    }
  }
}

// ─── Collect ──────────────────────────────────────────────────────────────────
if (!existsSync(INDEX_HTML)) {
  console.error('perf:check needs a built SPA. Run `npm run build:spa` first.');
  process.exit(1);
}

const payload = readInitialPayload();
const totalGzip = payload.reduce((sum, a) => sum + a.gzip, 0);
const current = {
  initialPayloadGzip: totalGzip,
  chunks: Object.fromEntries(payload.map((a) => [a.name, a.gzip]).sort((a, b) => b[1] - a[1])),
};

// ─── Update mode ──────────────────────────────────────────────────────────────
if (shouldUpdate || !existsSync(BUDGET_PATH)) {
  writeFileSync(BUDGET_PATH, `${JSON.stringify(current, null, 2)}\n`);
  console.log(`perf budget written: initial payload ${kb(totalGzip)} gzipped across ${payload.length} assets.`);
  for (const a of payload) console.log(`  ${a.name}: ${kb(a.gzip)} gz (${kb(a.raw)} raw)`);
  process.exit(0);
}

// ─── Check mode ───────────────────────────────────────────────────────────────
const budget = JSON.parse(readFileSync(BUDGET_PATH, 'utf8'));
const problems = [];

if (totalGzip > allowedFor(budget.initialPayloadGzip)) {
  problems.push(
    `initial payload is ${kb(totalGzip)} gzipped, budget allows ${kb(budget.initialPayloadGzip)} ` +
      `(+${kb(totalGzip - budget.initialPayloadGzip)})`,
  );
}

for (const [name, size] of Object.entries(current.chunks)) {
  const allowed = budget.chunks[name];
  if (allowed == null) {
    problems.push(`new asset in the initial payload: ${name} at ${kb(size)} gzipped`);
  } else if (size > allowedFor(allowed)) {
    problems.push(`${name} is ${kb(size)} gzipped, budget allows ${kb(allowed)} (+${kb(size - allowed)})`);
  }
}

checkNamedChunks(problems);

if (problems.length > 0) {
  console.error('perf:check failed:\n');
  for (const p of problems) console.error(`  • ${p}`);
  console.error('\nEvery byte here is on the critical path for every route, including sign-in.');
  console.error('Shrink it, move the code behind a lazy route, or — if the weight is genuinely');
  console.error('justified — run `npm run perf:baseline` and say why in the commit message.');
  process.exit(1);
}

const improved = budget.initialPayloadGzip - totalGzip;
console.log(
  improved > 0
    ? `perf:check passed (initial payload ${kb(totalGzip)} gzipped; ${kb(improved)} under baseline — run \`npm run perf:baseline\` to lock it in).`
    : `perf:check passed (initial payload ${kb(totalGzip)} gzipped, no regressions).`,
);
