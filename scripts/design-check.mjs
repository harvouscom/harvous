#!/usr/bin/env node
/**
 * Fast design-system cohesion checks.
 * - Required --pds-* token families exist in prototype-tokens.css
 * - Design-system + Shared Spaces gallery scene ids/slugs are unique
 * - Design-system primitive files avoid new inline fontSize styles
 *
 * Usage: node scripts/design-check.mjs
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

const root = process.cwd();
const errors = [];

function read(rel) {
  return readFileSync(resolve(root, rel), 'utf8');
}

function fail(msg) {
  errors.push(msg);
}

// ─── Token families ───────────────────────────────────────────────────────────
const tokensCss = read('spa/src/styles/prototype-tokens.css');
const requiredTokenPrefixes = [
  '--pds-space-',
  '--pds-z-',
  '--pds-duration-',
  '--pds-icon-',
  '--pds-warning',
  '--pds-success',
  '--pds-info',
  '--pds-destructive',
  '--pds-radius-',
  '--pds-shadow-',
  '--pds-accent',
];

for (const prefix of requiredTokenPrefixes) {
  if (!tokensCss.includes(prefix)) {
    fail(`Missing required token family in prototype-tokens.css: ${prefix}`);
  }
}

if (!tokensCss.includes('.pds-section-header')) {
  fail('Missing .pds-section-header typography class in prototype-tokens.css');
}

// ─── Gallery scene uniqueness ─────────────────────────────────────────────────
function extractSceneIds(source, label) {
  // Only count scene object ids / screenshotSlug fields (ignore comments).
  const ids = [...source.matchAll(/^\s*id:\s*'([^']+)'/gm)].map((m) => m[1]);
  const slugs = [...source.matchAll(/^\s*screenshotSlug:\s*'([^']+)'/gm)].map((m) => m[1]);
  const idSet = new Set();
  for (const id of ids) {
    if (idSet.has(id)) fail(`Duplicate scene id in ${label}: ${id}`);
    idSet.add(id);
  }
  const slugSet = new Set();
  for (const slug of slugs) {
    if (slugSet.has(slug)) fail(`Duplicate screenshotSlug in ${label}: ${slug}`);
    slugSet.add(slug);
  }
  return { ids, slugs };
}

const coreRegistry = read('spa/src/pages/dev/design-system/sceneRegistry.ts');
const sharedRegistry = read('spa/src/pages/dev/shared-spaces-design/sceneRegistry.ts');
const core = extractSceneIds(coreRegistry, 'design-system/sceneRegistry.ts');
const shared = extractSceneIds(sharedRegistry, 'shared-spaces-design/sceneRegistry.ts');

const allIds = new Set();
for (const id of [...core.ids, ...shared.ids]) {
  if (allIds.has(id)) fail(`Duplicate scene id across galleries: ${id}`);
  allIds.add(id);
}

if (core.ids.length < 5) {
  fail(`Expected at least 5 design-system core scenes, found ${core.ids.length}`);
}

// ─── No new inline fontSize in design-system primitives ───────────────────────
const dsDir = resolve(root, 'spa/src/pages/prototype/design-system');
if (existsSync(dsDir)) {
  for (const name of readdirSync(dsDir)) {
    if (!name.endsWith('.tsx')) continue;
    const src = readFileSync(join(dsDir, name), 'utf8');
    if (/fontSize\s*:/.test(src) || /style=\{\{[^}]*fontSize/.test(src)) {
      fail(`Inline fontSize found in design-system/${name} — use .pds-* type roles`);
    }
  }
}

// ─── Report ───────────────────────────────────────────────────────────────────
if (errors.length) {
  console.error('design:check failed:\n');
  for (const e of errors) console.error(`  • ${e}`);
  process.exit(1);
}

console.log(`design:check passed (${core.ids.length} core scenes, ${shared.ids.length} shared-spaces scenes)`);
