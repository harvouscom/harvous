#!/usr/bin/env node
/**
 * Keep the previous builds' hashed /assets/* alive across a Cloudflare deploy.
 *
 * The Worker serves dist-spa through Workers static assets, and every deploy uploads only
 * the build in hand — so the instant a deploy lands, the previous build's content-hashed
 * chunks 404 (cloudflare/worker.ts refuses, rightly, to answer them with index.html). Any
 * tab still running the old shell, and any PWA whose service worker served that shell
 * stale-while-revalidate, then fails its next lazy import: "Failed to fetch dynamically
 * imported module" / "Unable to preload CSS" in admin diagnostics, for code that was never
 * broken. Netlify kept old deploys' files reachable; Workers assets do not.
 *
 * So CI carries them forward itself. An archive directory (restored from the Actions cache)
 * holds every hashed file seen in the last 14 days plus a manifest of when each was last
 * part of a build. Before the upload, this script copies the archived files the new build
 * lacks into dist-spa/assets, then folds the new build into the archive. Uploads dedupe by
 * content hash, so the carried files cost almost nothing: a build is ~140 files / ~10 MB.
 *
 * Only *this* build's files get their lastSeen refreshed — a carried file keeps the date it
 * was last really built, which is what lets it age out. Sourcemaps are never carried or
 * archived, matching cloudflare/.assetsignore (they also exceed the 5 MiB per-file limit).
 *
 * Usage:
 *   node scripts/carry-forward-assets.mjs dist-spa/assets .asset-archive
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MANIFEST = 'manifest.json';
export const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

/** Files the upload ignores; carrying or archiving them would only waste cache space. */
export function isCarryable(name) {
  return name !== MANIFEST && !name.endsWith('.map');
}

/** Regular files directly in `dir` (Vite's assets dir is flat). Missing dir → []. */
export function listFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => e.name);
}

export function readManifest(archiveDir) {
  const path = join(archiveDir, MANIFEST);
  if (!existsSync(path)) return {};
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    // A corrupt manifest must not fail a deploy; worst case is today's behavior.
    return {};
  }
}

/**
 * Pure decision step: given the current build's files, the archive's manifest and the files
 * actually present in the archive, decide what to carry, what to prune, and the new manifest.
 */
export function planCarryForward({ currentFiles, manifest, archiveFiles, now, maxAgeMs = MAX_AGE_MS }) {
  const current = new Set(currentFiles.filter(isCarryable));
  const present = new Set(archiveFiles);
  const nextManifest = {};
  const carry = [];
  const prune = [];

  for (const [name, lastSeen] of Object.entries(manifest)) {
    if (current.has(name)) continue; // refreshed below
    const expired = typeof lastSeen !== 'number' || now - lastSeen > maxAgeMs;
    if (!isCarryable(name) || expired || !present.has(name)) {
      prune.push(name);
      continue;
    }
    nextManifest[name] = lastSeen;
    carry.push(name);
  }

  // Files in the archive with no manifest entry would otherwise sit in the cache forever.
  for (const name of present) {
    if (name !== MANIFEST && !(name in manifest) && !current.has(name)) prune.push(name);
  }

  for (const name of current) nextManifest[name] = now;

  return { carry: carry.sort(), prune: prune.sort(), archive: [...current].sort(), manifest: nextManifest };
}

/** Apply the plan to disk. Returns the plan so callers can report counts. */
export function carryForward({ assetsDir, archiveDir, now = Date.now(), maxAgeMs = MAX_AGE_MS }) {
  if (!existsSync(assetsDir)) throw new Error(`assets dir not found: ${assetsDir}`);
  mkdirSync(archiveDir, { recursive: true });

  const plan = planCarryForward({
    currentFiles: listFiles(assetsDir),
    manifest: readManifest(archiveDir),
    archiveFiles: listFiles(archiveDir),
    now,
    maxAgeMs,
  });

  for (const name of plan.prune) rmSync(join(archiveDir, name), { force: true });
  for (const name of plan.carry) copyFileSync(join(archiveDir, name), join(assetsDir, name));
  for (const name of plan.archive) copyFileSync(join(assetsDir, name), join(archiveDir, name));
  writeFileSync(join(archiveDir, MANIFEST), JSON.stringify(plan.manifest, null, 2) + '\n');

  return plan;
}

const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const [assetsDir, archiveDir] = process.argv.slice(2);
  if (!assetsDir || !archiveDir) {
    console.error('usage: node scripts/carry-forward-assets.mjs <assets-dir> <archive-dir>');
    process.exit(2);
  }
  const plan = carryForward({ assetsDir, archiveDir });
  console.log(
    `carry-forward-assets: carried ${plan.carry.length} file(s) from earlier builds, ` +
      `pruned ${plan.prune.length}, archive now holds ${Object.keys(plan.manifest).length}`,
  );
}
