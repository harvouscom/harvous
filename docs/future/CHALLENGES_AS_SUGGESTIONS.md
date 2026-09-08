# Challenges, and whether they are really a kind of suggestion

> **Status (4 September 2026): built, shipped in 3.0, and withheld the same day.**
>
> Nothing is deleted. Five routes, two pages, four templates and a production table are all
> exactly where they were. `WITHHELD_FEATURES` in [`src/lib/billing-plans.ts`](../../src/lib/billing-plans.ts)
> is what hides it, and removing `'challenges'` from that array is what brings it back.

## Why this doc exists

Challenges shipped in 3.0 without anyone having decided what it was.

That sounds like an accusation and is not one: it shipped because it was built to a written
spec, and the spec was good. What never happened is the step where someone uses it and says
"yes, that is the thing." The gap only surfaced on launch day, in a conversation that went
roughly: *we didn't build any challenges features* → *here is one, on screen* → *whoa*.

A feature its own author has not met is not ready to be sold, and arguably not ready to be
found. So it is switched off while the question gets answered properly.

## The three descriptions, and how far apart they are

**What the marketing said.** "Challenges — time-based quizzes, solo, with a group, or open to
the public." Timed, social, competitive, event-shaped. This is what was on the pricing page
until today, under COMING SOON.

**What the strategy doc says.** From
[REVIEWS_CHALLENGES_SEASON_PASS_STRATEGY.md](./REVIEWS_CHALLENGES_SEASON_PASS_STRATEGY.md):

> Challenges turn meaningful study opportunities into bounded, flexible paths. They should
> support focused exploration, **not pressure, competition, or generic productivity.**

**What shipped.** The doc's version, faithfully. An untimed, solo, private path of four or five
steps over material the reader already has. No clock, no group, no leaderboard, no score.
Skip sits beside Done on every step and a skipped path still completes.

So the build matches the intent, and the *marketing* is the thing that drifted. Worth being
precise about that, because the instinct on launch day was the opposite — that the build had
wandered off. It had not. The copy had.

**Why the copy drifted is the useful part.** The word "challenge" means a contest in every
other product a reader has used. Given only the name, the honest reconstruction of what it must
do is timed quizzes with other people — which is exactly what got written on the pricing page,
and exactly what got remembered a month later. The name generated the wrong spec twice.

## The reframing: a suggestion with a route attached

Derek's read, on first seeing one: *this is a special or different kind of suggestion.*

That is a better description than "challenge", and it survives inspection.

Harvous already has a surface whose whole job is noticing that a piece of study is worth
returning to and offering a way in — Suggestions on Activity, from
[`use-home-surface-data.ts`](../../spa/src/pages/prototype/use-home-surface-data.ts). Its offers
are single-step: *add a thought*, *thread these notes*, *what did you see here?*

A Challenge is that same act of noticing, with a longer route. "Strengthen this Thread" fires on
the same signal a suggestion would use — a Thread with enough in it and no path open — and then,
instead of one prompt, lays out five.

| | Suggestion | Challenge |
|---|---|---|
| Trigger | Harvous notices something | the same |
| Source | your own material | the same |
| Shape | one prompt, one sitting | four or five steps, over days |
| Ends with | a note or a link | a note *and* a link *and* a summary |
| Refusable | dismiss | Skip on any step; Put this down entirely |

If that reading holds, several things follow, and they are the substance of the next
conversation rather than settled conclusions.

## What follows if it is a suggestion

**It should probably live where suggestions live.** Today it has no home: no nav entry, no
Library item, nothing in settings. Its only doors are a Home row needing a 3+ note Thread
(`STRENGTHEN_MIN_NOTES`) and a note menu item needing a question-titled note. That is why it
went unseen for three days by the person who built it. But if it is a suggestion, "no page of
its own" stops being the bug and starts being the design — it should *appear when earned*, and
`/challenges` becomes a history rather than a destination.

**The name is probably wrong.** The UI already calls the thing a path — the challenge screen's
own heading is "The path". "Challenge" is what invited the timed-competitive spec twice. Names
worth weighing: Paths, a Study, a Track, or folding it into Suggestions with no separate noun
at all.

**Free is the likelier answer than paid.** It runs on notes the reader wrote and leaves them the
artifacts. Charging rent on a route through your own material is a strange sale, and Review is
the stronger paid hook anyway — it works from day one with no setup, where a Challenge needs a
Thread with three notes before it can say anything.

**Its relationship to Review needs stating.** They already overlap in code: `ChallengeStepKind`
lives in [`review-item-kinds.ts`](../../src/utils/review-item-kinds.ts), and the `ladder` step
kind walks the same verse ladder Review does. A `keep_verse` challenge is literally three Review
rungs followed by two writing steps. Is a Challenge then *a way to opt into Review deliberately*,
rather than waiting for the schedule? That framing is clean, and it is not the one the code
currently tells.

## Open questions

1. Is the unit of value the **path** (five steps, completed) or the **artifacts** (a note, a
   link, a summary)? If the artifacts, the path is scaffolding and could be much looser.
2. Should a Challenge ever be offered unprompted, or only accepted when Harvous suggests it?
   The current answer is "offered, once, on Home" — one row, one Thread, deliberately not a list.
3. What happens to a path left half-walked for a month? Today: nothing, it waits. A suggestion
   that never expires becomes a backlog, which the strategy doc explicitly does not want.
4. Does the group/church version from the original vision survive the reframing, or was it only
   ever a consequence of the word "challenge"? Note that the doc lists a group study as a
   *source* for a path, never as competition.
5. If Review and Challenges merge conceptually, is there one feature here with two speeds
   rather than two features?

## What is deliberately not on the table

**The timed, social, public version.** The strategy doc rules out competition on purpose, and
3.0 shipped a public promise of "no score, no streak, and no leaderboard." Building the thing
the old marketing copy described would break both. If seasons return, they return as
[Season Pass](./REVIEWS_CHALLENGES_SEASON_PASS_STRATEGY.md) — which is blocked on an editorial
content pipeline, not on code.

## Turning it back on

One line: remove `'challenges'` from `WITHHELD_FEATURES` in
[`src/lib/billing-plans.ts`](../../src/lib/billing-plans.ts).

Everything else already works. `PLUS_FEATURES` still grants the key while it is withheld, on
purpose, so every subscriber already holds a live row and nobody needs a backfill on the day it
returns.

Two things to know before flipping it:

- **Removing a key from a plan does not hide a feature.** `listActiveFeatureKeys` reads rows
  from `Entitlements`, so anyone already holding one keeps their access — the surfaces stay up
  for exactly the people most likely to be surprised. That is why the switch is a separate
  concept, checked in `hasEntitlementForUserId` and `useHasFeature`, rather than an edit to
  `PLUS_FEATURES`. It was tried the other way first and did not work.
- **There is one real challenge in the owner's account**, `Keep Ephesians 6:10`, created on
  4 September while demonstrating the feature. It is inert and unreachable while the feature is
  withheld, and it created no notes — only a `Challenges` row. It will reappear as a genuine
  in-progress path the moment this is turned back on.

## Where the code is

| Piece | Where |
|---|---|
| The switch | `WITHHELD_FEATURES` in `src/lib/billing-plans.ts` |
| Server enforcement | `hasEntitlementForUserId` in `server/utils/entitlements.ts` |
| Client enforcement | `useHasFeature` in `spa/src/hooks/useHasFeature.ts` |
| Routes (5, all gated) | `server/routes/challenges.ts` |
| Creation and step logic | `server/utils/challenge-service.ts` |
| The four templates | `src/utils/challenge-templates.ts` |
| Pages | `PrototypeChallengesPage.tsx`, `PrototypeChallengePage.tsx` |
| The one unasked offer | `PrototypeStrengthenThreadRow.tsx` |
| The note-menu entry | `PrototypeAddToReviewItem.tsx` |
