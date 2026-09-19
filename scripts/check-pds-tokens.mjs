#!/usr/bin/env node
/**
 * Every `var(--pds-*)` must name a token that is defined somewhere.
 *
 * A reference to a custom property nobody declares is invalid at computed-value time, and
 * CSS drops the *whole declaration* — no error, no warning. With a fallback the element
 * quietly renders the fallback forever, so the token name is a lie about where the value
 * comes from. Without one the property is simply gone. Both shipped:
 *
 *   - `.proto-shared-highlight-overlay__badge` set `color: var(--pds-bg-primary)` on a
 *     `--pds-text-primary` background. The colour fell back to the inherited text colour,
 *     so the count was drawn in the same colour as the badge behind it.
 *   - `.proto-find-popover__btn:hover` used `--pds-bg-hover`: no hover at all.
 *   - `AdminPulseHistoryChart` stroked its series with `--pds-accent-{blue,green,orange}`:
 *     every line and legend swatch rendered with no colour.
 *
 * 31 such names across 118 references were found by one sweep (Sept 2026), after being found by
 * eye one at a time for months — which is the argument for a check over a review habit.
 *
 * "Defined" means declared as a custom property (`--pds-x:`) in any scanned stylesheet, or
 * named as a string in TS (`setProperty('--pds-x', …)`, `{ '--pds-x': … }`), because some
 * tokens are written at runtime. Comments are ignored on both sides.
 *
 * A reference that genuinely must point at a runtime-only name can opt out on its line or
 * the line above:
 *
 *   pds-token-exempt: reason
 *
 * Usage: node scripts/check-pds-tokens.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, relative, resolve } from 'node:path';

const root = process.cwd();
const ROOTS = ['src', 'spa/src', 'public/scripts'].map((p) => resolve(root, p));
const EXTENSIONS = new Set(['.css', '.ts', '.tsx', '.js']);
const EXEMPT_MARKER = /pds-token-exempt:\s*\S/;

function filesUnder(path) {
  let stat;
  try {
    stat = statSync(path);
  } catch {
    return [];
  }
  if (stat.isFile()) return [path];
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'node_modules' || entry.name === 'dist') return [];
    const child = resolve(path, entry.name);
    return entry.isDirectory() ? filesUnder(child) : [child];
  });
}

/** Blank out comments but keep newlines, so line numbers still point at the source. */
function stripComments(source, isCss) {
  const blank = (m) => m.replace(/[^\n]/g, ' ');
  let out = source.replace(/\/\*[\s\S]*?\*\//g, blank);
  if (!isCss) out = out.replace(/(^|[^:'"`\\])\/\/[^\n]*/g, (m, lead) => lead + blank(m.slice(lead.length)));
  return out;
}

const files = ROOTS.flatMap(filesUnder).filter((f) => EXTENSIONS.has(extname(f)));
const defined = new Set();
const uses = [];

for (const file of files) {
  const raw = readFileSync(file, 'utf8');
  if (!raw.includes('--pds-')) continue;
  const source = stripComments(raw, extname(file) === '.css');
  for (const m of source.matchAll(/(--pds-[a-zA-Z0-9-]+)\s*:/g)) defined.add(m[1]);
  for (const m of source.matchAll(/['"`](--pds-[a-zA-Z0-9-]+)['"`]/g)) defined.add(m[1]);

  const rawLines = raw.split('\n');
  source.split('\n').forEach((line, i) => {
    for (const m of line.matchAll(/var\(\s*(--pds-[a-zA-Z0-9-]+)(\$\{)?/g)) {
      // `var(--pds-thread-${key})` names a family, not a token; the family is the caller's to check.
      if (m[2]) continue;
      if (EXEMPT_MARKER.test(rawLines[i]) || (i > 0 && EXEMPT_MARKER.test(rawLines[i - 1]))) continue;
      uses.push({ name: m[1], file, line: i + 1 });
    }
  });
}

const failures = uses.filter((u) => !defined.has(u.name));

if (failures.length > 0) {
  console.error(`check:pds-tokens — ${failures.length} reference(s) to undefined --pds-* tokens:\n`);
  for (const f of failures) {
    console.error(
      `  ${relative(root, f.file)}:${f.line}: ${f.name} is defined nowhere, so CSS drops the ` +
        `declaration (or silently uses its fallback). Use a real token from ` +
        `spa/src/styles/prototype-tokens.css, or mark it "pds-token-exempt: <reason>".`,
    );
  }
  process.exit(1);
}

console.log(`check:pds-tokens — ${uses.length} references to ${defined.size} defined tokens, all resolve.`);
