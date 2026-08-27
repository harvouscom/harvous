# Richer Home recommendations

**Status:** design only, not built. Extends `MEMORY_LAYER_ASSESSMENT.md`.
**Prerequisite (shipped Aug 2026):** the recall feedback loop — acting on a card now rests
it, and open/snooze history syncs across devices via `GET /api/recall/events/recent`.

## Why this is worth doing

The Aug 2026 fix closed the loop that made recommendations feel broken: acting on a card
recorded nothing, so the same suggestion returned even after the user had followed it.
That was a correctness bug, and fixing it does not make the recommendations *good*.

What's left is that ranking is still static. `selectRecallOpportunities` sorts by a fixed
usefulness comparator, applies a soft-variety rotation, and slices to six. It never learns
which *kinds* of card this particular user acts on. Someone who has ignored every
"reflection" card for two months still gets them at the same rate as someone who opens
every one.

## Signals that exist and are unused

Every one of these is already written to on the user's normal path. None needs new
collection.

| Source | Signal | Why it matters |
|---|---|---|
| `RecallEvents` | impression / open / snooze per `kind`, per user, with timestamps | The direct measure of what works. **Impressions are already recorded**, so an open-rate per kind is computable today without any new writes. |
| `WeeklyStreaks` | `daysWithSessions`, `weekStart` | Cadence. Someone returning after a two-week gap wants a way back in, not a card assuming continuity. |
| `UserXP` / `UserSeasonalXP` | `activityType`, `relatedId`, `sessionCount` | Which activities this user actually does — highlighting vs. writing vs. reading. |
| `NoteVersions` | revision count and depth per note | Edit frequency as a meaning signal, independent of `meaningWeight`. |
| `UserFeaturedItems` | per-user dismissal of featured content | An existing, proven per-user suppression pattern (`useFeaturedDismissed`) worth copying rather than reinventing. |
| `VotdSchedule` | the day's passage | Aligning a suggestion with what the user is already reading today. |

## Proposed shape

**1. Per-kind acceptance rate.** Derive `opens / impressions` per `kind` from
`RecallEvents` over a trailing window, as a multiplier on the existing usefulness score.
Serve it from the same endpoint the suppression list already uses — the rows are being
read anyway.

Guardrails, or this collapses into a monoculture:
- Floor the multiplier so no kind can be driven to zero. A kind the user has never been
  shown must stay reachable.
- Require a minimum impression count before the rate is trusted; below it, use the
  population default.
- Keep `orderRecallWithSoftVariety` in front of the final slice. Diversity is a product
  decision, not something the score should be able to override.

**2. Cadence awareness.** Use `WeeklyStreaks` to pick a re-entry card after a gap
(something short and concrete) over one that assumes an ongoing thread.

**3. Respect existing intent.** From the memory-layer assessment, unchanged and still
binding: pins, `collectionUserOverride`, `dismissedAutoTags`, and the recall cooldowns
already encode what the user wants. New scoring **consumes** them; it never overrides them.

## What not to do

- **Don't add a spaceId to `RecallEvents` yet.** Home only runs in the personal space, so
  user-scoped history is a correct superset. It becomes necessary the moment recall ships
  inside shared spaces — that's the trigger, not this work.
- **Don't build recall trails.** Dropped deliberately in the memory-layer assessment: only
  8 `NoteConnections` edges across 5 of 115 users. The data isn't there.
- **Don't tune by intuition.** The per-kind rates are measurable now. Read the actual
  open-rate per kind from `RecallEvents` *before* changing any weights — the answer may be
  that one or two kinds account for nearly all engagement, which is a much simpler fix
  (drop the dead kinds) than a scoring model.

## Suggested first step

Not code: a query. Open-rate per `kind` over the last 60 days, across all users. If the
spread is flat, ranking isn't the problem and this whole document is premature. If it's
steep, it tells you exactly which kinds to cut or promote, and the scoring work becomes
optional.

## The finding (Aug 2026)

The suggested first step was run: `npm run recall:kind-rates`
(`server/scripts/recall-open-rate-by-kind.ts`). Sixty days, deduped to one row per
(kind, user, opportunity, day) — an impression fires per shelf render, so the raw ratio
would understate acceptance by however often someone loads Home.

| kind | shown | opened | rate | users |
|---|---:|---:|---:|---:|
| revisitNote | 145 | 8 | **5.5%** | 9 |
| annotateHighlight | 130 | 14 | 10.8% | 17 |
| continueBook | 99 | 31 | **31.3%** | 39 |
| crossrefGap | 67 | 12 | 17.9% | 23 |
| highlight | 32 | 3 | 9.4% | 8 |
| connectNotes | 28 | 2 | 7.1% | 12 |
| passage | 25 | 3 | 12.0% | 9 |
| reflection | 18 | 3 | 16.7% | 3 |
| arc | 18 | 1 | 5.6% | 3 |
| subject | 17 | 3 | 17.6% | 5 |
| studyPerson | 5 | 1 | 20.0% | 3 |
| referenceWord | 1 | 0 | 0% | 1 |

**The spread is steep, and it runs against `RECALL_KIND_TIER`.** `continueBook` is tier 1
and outperforms everything — six times `revisitNote`'s rate, and reached 39 users against
its 9. `crossrefGap`, also tier 1, is more than three times `revisitNote`. The two kinds we
rank highest, `revisitNote` and `annotateHighlight`, account for 275 of 585 impressions and
22 of 81 opens.

**Position cannot explain that away — which is what makes it usable.** The confound the
script prints is real: tier-0 kinds get pinned to the head slot, so their rates are
*flattered*, not suppressed. `revisitNote` has the positional advantage and still has the
worst rate of anything with volume. That direction is safe to act on. The reverse is not:
`continueBook` may be even better than 31% once position is controlled for, so its number
is a floor, not an estimate.

**So the answer to the question this document asked is: not a multiplier, not yet.** Two
cheaper things come first.

1. **Re-tier by hand, on this evidence.** `continueBook` and `crossrefGap` are earning
   their impressions and are being ranked below two kinds that are not. That is a one-line
   change to `RECALL_KIND_TIER`, not a scoring model — and a scoring model built on these
   numbers would only launder the current tiers into "the users chose this".
2. **Add a `position` column to `RecallEvents`.** Without it no rate here can ever be
   decomposed, so the multiplier stays unbuildable on evidence no matter how long the log
   grows. This is the actual prerequisite.

**One more thing the numbers say: `complete` has never been recorded. Not once, for any
kind.** Every generative kind can report it and none has. Either the completion callbacks
are not wired on most of them, or nobody has finished what a generative card asked for.
Worth finding out which before any of the above — a whole action of
`RECALL_EVENT_ACTIONS` being empty is a measurement bug until proven otherwise.

**A note on `revisitNote` specifically.** Its low rate was measured before visits became a
ranking signal (see `NoteVisitEvents` and `revisitReturnsBoost`). The kind was picking notes
using only what had been *written*, which is exactly the blind spot that work closes — so
re-measure it after the visit log has a few weeks of data rather than cutting it on this
number.
