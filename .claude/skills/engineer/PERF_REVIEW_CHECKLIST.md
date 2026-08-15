# Performance Review Checklist

Use on every `/engineer` task. Mark items that apply.

## Before coding

- [ ] Named the number this task should move, and the method that reads it
- [ ] Recorded the **before** measurement (not an estimate)
- [ ] Profiled rather than guessed — the thing being optimized is the thing that showed up
- [ ] Checked `docs/performance/PERF_BASELINE.md` for whether this is already known
- [ ] Read the owning agent's context file for every file to be edited outside `docs/performance/**`

## Bundle and build

- [ ] `npm run build:spa && npm run perf:check` passes
- [ ] No new asset added to the initial payload without a stated reason
- [ ] New heavy code sits behind a lazy route or dynamic import, not in the entry
- [ ] Every `manualChunks` entry still emits a real chunk (the check enforces this)
- [ ] New dependency justified against its gzipped cost, and a lighter option ruled out

## Runtime

- [ ] User-initiated actions paint before the network (optimistic, or a synchronous draft path)
- [ ] Query readiness gates include every query the surface actually renders from
- [ ] No speculative `useMemo`/`memo`/`useCallback` added "just in case"
- [ ] Context value changes don't re-render consumers that don't read the changed field
- [ ] Lists that can grow are windowed or paged, not fully rendered
- [ ] Effects that fire per-render or per-keystroke are debounced or idle-deferred

## Perceived speed

- [ ] Lazy routes have a pending state — never a blank pane
- [ ] Late-arriving data doesn't reorder or reflow what is already on screen
- [ ] Prefetch is bound to `pointerdown`/`touchstart`, not `pointerenter` (which is tap-time on touch)
- [ ] Sheets and overlays measure once; content doesn't arrive mid-animation
- [ ] `prefers-reduced-motion` and reduced transparency honoured

## Guard

- [ ] Recorded the **after** measurement, in the same units as the before
- [ ] Left a regression guard: a budget line, a test, or a check-script rule
- [ ] If the budget improved, ran `npm run perf:baseline` to lock it in
- [ ] If the budget grew, said why in the commit message

## Handoff

- [ ] Cross-domain touches named in the response, with the owning agent
- [ ] `.claude/agents/engineer.context.md` updated with both numbers and any new gotcha
- [ ] `docs/performance/PERF_BASELINE.md` updated if the baseline moved
- [ ] `npm run test:run` and `npm run typecheck:ratchet` pass
