#!/usr/bin/env node

/**
 * Injects package.json version + the CI build id into public/sw.js CACHE_NAME so each
 * deploy invalidates the PWA cache and users get fresh HTML/CSS/JS (including layout updates).
 * Run before build (e.g. prebuild) so the built site ships with the correct cache key.
 *
 * The build id matters: version alone means a deploy without a `chore: bump version` commit
 * ships a byte-identical sw.js. The browser then sees no update, never re-runs install/activate,
 * and keeps serving the previous deploy's cached index.html — whose hashed chunk URLs Netlify
 * has already deleted. Appending the commit ref makes every deploy roll the cache.
 *
 * Only appended in CI so local builds stay deterministic and don't churn the tracked file.
 * `extractVersionFromCacheName` in service-worker-manager.js matches the v<maj>-<min>-<patch>
 * prefix with an unanchored regex, so the suffix is safe for major-update detection.
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const pkgPath = join(root, 'package.json');
const swPath = join(root, 'public', 'sw.js');

const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const version = pkg.version || '0.0.0';
// e.g. "1.132.0" -> "v1-132-0"
const cacheVersion = 'v' + version.replace(/\./g, '-');
// Netlify sets COMMIT_REF (and DEPLOY_ID) on every build, including redeploys of the same
// commit. GitHub Actions sets GITHUB_SHA instead, and sets neither of the others — so the
// Cloudflare deploy workflow would otherwise fall through to an empty build id here and ship
// a byte-identical sw.js for every deploy between two version bumps, which is exactly the
// failure the paragraph above describes. Keep all three.
const buildId = (process.env.COMMIT_REF || process.env.DEPLOY_ID || process.env.GITHUB_SHA || '')
  .replace(/[^a-zA-Z0-9]/g, '')
  .slice(0, 8);
const cacheName = buildId
  ? `harvous-cache-${cacheVersion}-${buildId}`
  : `harvous-cache-${cacheVersion}`;

let sw = readFileSync(swPath, 'utf8');
const pattern = /const CACHE_NAME = '[^']+';/;
if (!pattern.test(sw)) {
  console.error('inject-sw-cache-version: CACHE_NAME line not found in public/sw.js');
  process.exit(1);
}
sw = sw.replace(pattern, `const CACHE_NAME = '${cacheName}';`);
writeFileSync(swPath, sw);
console.log('inject-sw-cache-version: set CACHE_NAME to', cacheName);
