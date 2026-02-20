#!/usr/bin/env node

/**
 * Injects package.json version into public/sw.js CACHE_NAME so each deploy
 * invalidates the PWA cache and users get fresh HTML/CSS/JS (including layout updates).
 * Run before build (e.g. prebuild) so the built site ships with the correct cache key.
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
const cacheName = `harvous-cache-${cacheVersion}`;

let sw = readFileSync(swPath, 'utf8');
const pattern = /const CACHE_NAME = '[^']+';/;
if (!pattern.test(sw)) {
  console.error('inject-sw-cache-version: CACHE_NAME line not found in public/sw.js');
  process.exit(1);
}
sw = sw.replace(pattern, `const CACHE_NAME = '${cacheName}';`);
writeFileSync(swPath, sw);
console.log('inject-sw-cache-version: set CACHE_NAME to', cacheName);
