#!/usr/bin/env node
/**
 * A `--color-*` reference built from a runtime value must carry a fallback.
 *
 * The `--color-*` set defines twelve hues. The columns these values come from
 * (`UserMetadata.userColor`, `Spaces.color`, `Threads.color`) are free text with no enum, so
 * a value can arrive that no token backs — a retired hue, a fixture, a typo. CSS treats
 * `var(--color-teal)` with nothing behind it as invalid and drops the *whole declaration*, so
 * the element does not fall back to a default colour: it loses its background entirely.
 *
 * That failure is silent. Nothing logs, nothing throws, the element just renders empty. It
 * shipped for months as activity-feed avatars with no fill, and it was found by eye, not by
 * any test — which is the whole argument for a check rather than a code review habit.
 *
 * The fix at every call site is `colorTokenVar(value, fallback)` from `src/utils/space-cover.ts`,
 * which keeps the caller's own default and emits `var(--color-x, var(--color-fallback))` for a
 * hue it cannot resolve.
 *
 * This flags interpolation only — `var(--color-${x})`. A hardcoded `var(--color-blue)` is fine
 * and common, because a literal is checkable by reading it. A call site that genuinely must
 * interpolate without the helper can opt out with an inline comment:
 *
 *   // color-token-exempt: reason this reference cannot resolve to nothing
 *
 * Usage: node scripts/check-color-token-fallbacks.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, relative, resolve } from 'node:path';

const root = process.cwd();
const ROOTS = ['src', 'spa/src'].map((p) => resolve(root, p));
const EXTENSIONS = new Set(['.ts', '.tsx']);
const EXEMPT_MARKER = /color-token-exempt:\s*\S/;

/** `var(--color-` immediately followed by a template hole — the unguarded shape. */
const INTERPOLATED = /var\(--color-\$\{/;

/**
 * Already guarded: a second argument inside the `var()`, i.e. `var(--color-${x}, ...)`.
 * Matched on the same line, which is how every one of these is written.
 */
const HAS_FALLBACK = /var\(--color-\$\{[^}]*\}\s*,/;

/** The helper itself is where the guarded reference is constructed. */
const ALLOWED_FILES = new Set([resolve(root, 'src/utils/space-cover.ts')]);

function filesUnder(path) {
  if (statSync(path).isFile()) return [path];
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'node_modules') return [];
    const child = resolve(path, entry.name);
    return entry.isDirectory() ? filesUnder(child) : [child];
  });
}

const failures = [];
let scanned = 0;

for (const dir of ROOTS) {
  for (const file of filesUnder(dir)) {
    if (!EXTENSIONS.has(extname(file))) continue;
    if (ALLOWED_FILES.has(file)) continue;
    const source = readFileSync(file, 'utf8');
    if (!INTERPOLATED.test(source)) continue;
    scanned++;

    const lines = source.split('\n');
    lines.forEach((line, i) => {
      if (!INTERPOLATED.test(line)) return;
      if (HAS_FALLBACK.test(line)) return;
      if (EXEMPT_MARKER.test(line)) return;
      // Allow the marker on the line above, where a reason needs the room.
      if (i > 0 && EXEMPT_MARKER.test(lines[i - 1])) return;
      failures.push(
        `${relative(root, file)}:${i + 1}: \`var(--color-\${…})\` with no fallback — an ` +
          `unrecognised hue drops the whole declaration and the element renders with nothing. ` +
          `Use \`colorTokenVar(value, fallback)\` from src/utils/space-cover.ts, or mark it ` +
          `exempt with "// color-token-exempt: <reason>".`,
      );
    });
  }
}

if (failures.length > 0) {
  console.error(['Color token fallback check failed.', ...failures.map((f) => `- ${f}`)].join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Color token fallback check passed (${scanned} file(s) with interpolated tokens).`);
}
