# Typecheck debt

**Status:** ratchet in place (Aug 2026). Cleanup not started.

`tsc --noEmit` reports **291 errors across 118 files**. Nothing ran it, so those errors
were invisible — and not harmless. Two shipped bugs found during the Aug 2026 reliability
pass were already sitting in that output:

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

| # | Root cause | Errors | Files | Notes |
|---|---|---|---|---|
| 1 | Router `to=` route literals | **56** | 24 | `prototypeNoteRouteTo()` returns `'/$noteId' \| '/prototype/$noteId'`, but only one is in the generated route tree, so the union never satisfies `to`. Call sites work around it with `as any` (e.g. `PrototypeInspectorPane`). Fix once in `src/lib/prototype-path.ts` — either register the legacy prefixed routes or type the return against the router's own `ToPathOption` — and the `as any` casts come out with it. |
| 2 | Test-file typing | ~40 | ~12 | Concentrated in `study-dock-layout`, `note-html-highlight-marks`, `study-thread-cluster-xp`. Mostly incomplete fixture objects. Low risk, no production impact. |
| 3 | `spa/src/router.tsx` | 15 | 1 | Likely resolves alongside #1. |
| 4 | Icon name literals | 5 | few | `string` passed where `IconName` is expected. Either narrow the call sites or widen the prop. |
| 5 | `UserMetadata` schema drift | 2 | 2 | Fixtures missing `hmcChurchId`, `sharedSpaceSwitcherOrder`, `polarCustomerId`. |
| 6 | Long tail | remainder | scattered | `TS2339` property-does-not-exist and `TS2345` argument-type, case by case. |

Do this on its own branch. It touches 118 files, which is a large conflict surface against
any concurrent work in `spa/src/pages/prototype/`.

Once the count reaches zero, replace the ratchet with a plain `tsc --noEmit` gate and
delete `scripts/typecheck-baseline.json`.
