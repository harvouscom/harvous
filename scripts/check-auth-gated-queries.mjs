#!/usr/bin/env node
/**
 * Every React Query hook under spa/src/hooks that calls an authenticated
 * `/api/*` endpoint must gate `enabled` on `useAuthReady()`. Without it, the
 * hook fires in the brief window where Clerk reports signed-in but the
 * session cookie the API needs isn't attached yet — a 401 that never
 * auto-retries once the query settles into `isError` (React Query doesn't
 * retry a settled query on its own). The user sees a hard error that only
 * clears on a manual refresh/retry.
 *
 * Real incident: useSpace, useSpaceMembers, and useSharedSpaceActivityPreview
 * shipped without this gate while sibling hooks (useSpaceNotes,
 * useSpaceGroupThreads, usePrototypeSpaceScriptureIndex) already had it —
 * "Could not load this shared space" on cold load into a shared-space route,
 * fixed by one manual Retry. See spa/src/hooks/useAuthReady.ts.
 *
 * This check can't verify the gate is wired into `enabled` correctly (that
 * needs real type/data-flow analysis) — it verifies the hook calls
 * `useAuthReady()` at all, which is the part that's been silently skipped.
 * A hook that legitimately doesn't need the gate (public endpoint, or gated
 * on some other readiness signal) can opt out with an inline comment:
 *
 *   // auth-gate-exempt: reason this endpoint doesn't need session readiness
 *
 * Usage: node scripts/check-auth-gated-queries.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, relative, resolve } from 'node:path';

const root = process.cwd();
const HOOKS_ROOT = resolve(root, 'spa/src/hooks');
const EXEMPT_MARKER = /auth-gate-exempt:\s*\S/;
/*
 * Two shapes of authenticated call, because the checker used to see only the first and
 * therefore passed clean on hooks that had no gate at all.
 *
 * `useNavigation` calls `fetch('/api/navigation/data')` directly rather than going through
 * the `api` wrapper, so `API_CALL` never matched — and it was ungated, firing into the
 * cold-start cookie gap with `retry: 2`, which is exactly the incident this check exists to
 * prevent. Both forms count now.
 */
const API_CALL = /\bapi\.(get|post|put|patch|delete)\s*[<(]|\bfetch\s*\(\s*[`'"]\/api\//;
const REACT_QUERY_CALL = /\b(useQuery|useInfiniteQuery)\s*\(/;
const AUTH_READY_CALL = /\buseAuthReady\s*\(/;
// Matches `export function useFoo(` or `export const useFoo = (` — this
// codebase only uses the former today, but both are supported.
const HOOK_START = /export\s+(?:function\s+(use[A-Za-z0-9_]*)\s*\(|const\s+(use[A-Za-z0-9_]*)\s*=[^=]*?=>\s*\{)/g;
/*
 * Any function in the file, hook or not — so a hook that assembles its query from a helper
 * still counts as calling the endpoint that helper calls.
 *
 * `useNote` is the case that motivated this: its `useQuery` is in the hook, but the
 * `api.get('/api/notes/:id/details')` lives in `getNoteQueryOptions`, a plain exported
 * function. Attributing calls only to `use*` bodies meant the two halves never met and the
 * hook looked like it touched no endpoint at all.
 */
const ANY_FUNCTION_START =
  /(?:export\s+)?(?:async\s+)?(?:function\s+([A-Za-z0-9_]+)\s*\(|const\s+([A-Za-z0-9_]+)\s*=[^=]*?=>\s*\{)/g;

function filesUnder(path) {
  if (statSync(path).isFile()) return [path];
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === '__tests__' || entry.name === 'node_modules') return [];
    const child = resolve(path, entry.name);
    return entry.isDirectory() ? filesUnder(child) : [child];
  });
}

/** From an opening `{` (or the `(` of a function-declaration signature,
 *  in which case we first walk to its matching `)` then the following
 *  `{`), returns the index just past the matching closing brace. */
function findFunctionBodyEnd(source, hookStartIndex) {
  let i = source.indexOf('{', hookStartIndex);
  if (i === -1) return -1;
  let depth = 0;
  for (; i < source.length; i++) {
    const ch = source[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return i + 1;
    } else if (ch === '`' || ch === "'" || ch === '"') {
      // Skip over string/template literals so braces inside them don't
      // desync the depth count.
      const quote = ch;
      i++;
      while (i < source.length && source[i] !== quote) {
        if (source[i] === '\\') i++;
        i++;
      }
    }
  }
  return -1;
}

const failures = [];
let scanned = 0;

for (const file of filesUnder(HOOKS_ROOT)) {
  const ext = extname(file);
  if (ext !== '.ts' && ext !== '.tsx') continue;
  scanned++;
  const source = readFileSync(file, 'utf8');

  // Helpers in this file that reach an authenticated endpoint themselves. A hook that calls
  // one of these is reaching that endpoint too, however indirectly.
  const apiHelpers = new Set();
  for (const match of source.matchAll(ANY_FUNCTION_START)) {
    const name = match[1] ?? match[2];
    if (!name || name.startsWith('use')) continue;
    const end = findFunctionBodyEnd(source, match.index);
    if (end === -1) continue;
    if (API_CALL.test(source.slice(match.index, end))) apiHelpers.add(name);
  }

  for (const match of source.matchAll(HOOK_START)) {
    const hookName = match[1] ?? match[2];
    const bodyEnd = findFunctionBodyEnd(source, match.index);
    if (bodyEnd === -1) continue;
    const body = source.slice(match.index, bodyEnd);

    if (!REACT_QUERY_CALL.test(body)) continue;
    const callsApiHelper = [...apiHelpers].some((name) =>
      new RegExp(`\\b${name}\\s*\\(`).test(body),
    );
    if (!API_CALL.test(body) && !callsApiHelper) continue;
    if (AUTH_READY_CALL.test(body)) continue;
    if (EXEMPT_MARKER.test(body)) continue;

    const line = source.slice(0, match.index).split('\n').length;
    failures.push(
      `${relative(root, file)}:${line}: ${hookName}() calls an authenticated endpoint via useQuery/useInfiniteQuery ` +
        `without useAuthReady() — add the gate, or mark it exempt with "// auth-gate-exempt: <reason>".`,
    );
  }
}

if (failures.length > 0) {
  console.error(
    ['Auth-gated query check failed.', ...failures.map((f) => `- ${f}`)].join('\n'),
  );
  process.exitCode = 1;
} else {
  console.log(`Auth-gated query check passed (${scanned} hook files scanned).`);
}
