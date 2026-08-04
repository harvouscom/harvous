# Typecheck debt

**Status:** ratchet in place; cleanup **in progress on `fix/typecheck-debt`**.
**291 → 205** (30% cleared; causes #1, #2 and #3 done).

**Three real bugs surfaced so far**, all in the `Date`-vs-`string` cluster — which is why
that cluster was ranked by risk rather than by count:

- Tag dedupe compared timestamps with `Date.parse(row.createdAt)` on a value that is a
  `Date`. The coercion goes through `toString()`, which has *second* precision, so tags
  created in the same second tied and fell through to id ordering.
- `connectedChurchAt` passed a preserved ISO string straight into a `ts()` (Date) column.
  Its unit test agreed with the wrong shape because the test's own mock stubbed
  `nowISO()` as a string.
- **`invalidateUserCache` never invalidated anything.** It stamped `clerkDataUpdatedAt`
  with `new Date(0).toISOString()`; Drizzle's date-mode mapper is
  `(value) => value.toISOString()`, so the string threw `TypeError` on every call. Both
  callers catch, so nothing 500'd — the app just kept serving stale Clerk name/email/
  avatar after a `user.updated` webhook until the TTL expired.

Both had a passing test suite over them. Wrong annotations here don't just hide errors —
they teach the tests the wrong shape.

`tsc --noEmit` originally reported **291 errors across 118 files**. Nothing ran it, so
those errors were invisible — and not harmless. Two shipped bugs found during the Aug 2026
reliability pass were already sitting in that output:

- `PrototypeSidebar` read `p.items` from a page whose field is `notes`, so `myHomeNotes`
  became `[undefined]` and `myHomeNotesById` threw.
- Home's readiness call passed five settled-flags its parameter type didn't declare. TS
  flagged the excess properties; all five were silently discarded at runtime, which is why
  Home painted before its data was ready and visibly jumped.

## What's in place now

`npm run typecheck:ratchet` (wired into `precommit`) records a per-file baseline in
`scripts/typecheck-baseline.json` and fails when any file's error count *increases*, or a
clean file gains its first error. Fixing errors is always allowed; run
`npm run typecheck:baseline` to lock in an improvement.

Per-file rather than a total, so trading a fixed error in one file for a new one in
another still fails.

Cost: the ratchet runs `tsc`, which takes ~60–90s. If that's too slow for every commit,
move `typecheck:ratchet` out of `precommit` and into CI — the value is in blocking the
regression, not in where the check runs.

## Cleanup plan, by root cause

Work down by cause, not by file — a fifth of the total is one fix. Re-baseline after each.

| # | Root cause | Errors | Status |
|---|---|---|---|
| 1 | Router `to=` route literals | 54 | **Done.** The shell is mounted twice over and which one exists is a *runtime* host decision, so TS infers one tree (the `/prototype`-prefixed one) while the helpers returned the honest union of both. Helpers now declare the prefixed literal and cast, reasoning documented once in `src/lib/prototype-path.ts`. `prototypeHomeRouteTo()` also returned a `/prototype/` that was never a registered route. 18 now-redundant `as any` casts came out with it. |
| 2 | Missing type imports | 17 | **Done.** `FolderBucket`, `StudyThreadClusterEdge`, and vitest globals. Types are erased so none were runtime bugs, but each turned off checking exactly where it was requested — including in `PrototypeSidebar`, the file whose `p.items` typo shipped a crash. |
| 3 | `Date` vs `string` on Drizzle `ts()` columns | ~19 | **Done.** See the three bugs above. Recipe that worked: make the type say `Date`, normalize through `toDate()` at the boundary, then re-run — an honest type surfaces the *next* offender, which is how the invalidateUserCache bug appeared. Check test mocks too; one was stubbing `nowISO()` as a string. |
| 4 | Test fixtures missing required fields (`TS2353`) | ~19 | Mechanical. Concentrated in `study-dock-layout.test.ts` (15) and `prototype-format-toolbar-selection.test.ts` (6). No production impact. |
| 5 | Property does not exist (`TS2339`) | ~34 | Case by case — the class most likely to contain genuine bugs, since it means code reads a field the type says isn't there. Worth reading rather than batch-fixing. |
| 6 | Long tail | remainder | `server/routes/migrations.ts` (9), `offline-mutations.ts` (8), `admin-cleanup-duplicates.ts` (8), `TiptapEditor.tsx` (12), scattered `TS2345`. |

Current split: **48 in tests, 157 in production.**

Note `nowISO` is an alias for `now()` and returns a **Date**, not an ISO string. The
name has misled at least two call sites and one test mock; renaming it is probably
worth doing as part of this cleanup.

Do this on its own branch. It touches 118 files, which is a large conflict surface against
any concurrent work in `spa/src/pages/prototype/`.

Once the count reaches zero, replace the ratchet with a plain `tsc --noEmit` gate and
delete `scripts/typecheck-baseline.json`.
