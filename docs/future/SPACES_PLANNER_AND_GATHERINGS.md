# Shared Spaces, the Planner, and Where a Gathering Shows Up

**Status:** Decision doc, and a correction. Most of what this item asked for is already built.
**Last Updated:** August 21, 2026
**Audience:** Whoever decides how a room's rhythm reaches the people in it.
**Covers:** improvement-list item #1 (shared spaces + planner + "add gathering") — design-track
item D-6. The plan flagged this one as needing a product conversation before design; the
conversation it needs turns out to be much narrower than the item implies.

---

## Executive summary

**This item is largely out of date, and saying so is most of its value.** The church and planner
layer moved substantially between the improvement list being written and now. Nearly every piece
D-6 was framed around has since shipped, and re-proposing them would be re-deciding settled
questions.

What survives is one asymmetry, and it is a real product question:

> **A church's next service reaches Home. A room's next gathering does not.**
> `PrototypeHomeThisSunday.tsx` puts the church's service on Home with one tap into notes on it.
> A shared space's gathering appears only inside that space
> (`PrototypeSpaceComingUp.tsx`, rendered from `PrototypeSidebarSharedSpaceView.tsx:854`). Someone
> in three groups that all meet this week is told about none of them until they visit each room
> in turn — while the church they merely follow gets a card on the front page.

**Recommendation: Option B — a room's next gathering reaches Home on the same terms the church's
does, bounded by the four-day wall rather than by a count.** The doctrine already in force is
"one next gathering per context you joined, never a schedule of any context"
(`CHURCH_SPACE_PLANS_AND_SERVICE_TIMES.md` §1). A room you joined is such a context. The wall is
what keeps several of them from becoming a calendar, and it is a rule the codebase already has.

---

## First: what the item asked for, and what is already true

Each row below was checked against `main` rather than against the earlier assessment, because
several of that assessment's findings have since been closed.

| The premise | What is actually true |
|---|---|
| "Add a gathering" is a feature to design | It is one of **three labels for one create action**. `planVocabulary()` (`spa/src/lib/church-services.ts:509`) returns "Add a sermon" (church plan), "Add a study" (channel), or "Add a gathering" (a room that meets). `planKind` is server-derived from the space, never chosen by the client. |
| Rooms retype the date of every gathering | `rhythmDates()` (`church-services.ts:383`) offers the next six dates from the room's declared rhythm, wired into the entry editor (`PrototypeSermonEditorFields.tsx:181`). It offers dates; it does not schedule or recur, and its own comment says so. |
| Only church rooms can plan | A churchless shared space can hold a plan, and the Planner row appears in its own view for whoever can manage it — with the reasoning recorded inline: "otherwise the one person who could plan the first gathering is the one person who cannot find where" (`PrototypeSidebarSharedSpaceView.tsx:380-400`). |
| Only staff can see the plan | The read is membership-gated. Members of the room see what it is on, and get the same one tap into notes that the church card gives (`PrototypeSpaceComingUp.tsx`). |
| Connecting to a church should auto-follow its channels | Considered and **deliberately declined**. `PrototypeMinistryPicker.tsx` exists instead — a congregant chooses which ministries they are part of. The comment there names auto-follow-all as the obvious fix and says why it was refused. |
| The public study-plan preview is a phantom endpoint | It has a client now: `PublicSharedThreadPage.tsx:133`. |
| Study plans are undocumented | `docs/future/STUDY_PLANS.md`. |

Two anti-goals are load-bearing and should survive any change here, because both were arrived at
the hard way:

- **Nothing fires on a clock.** `schema.ts:47-51` states it directly for `meetingDay` /
  `meetingTime` / `publishCadence`: they are display and defaults, and "whoever runs the room
  still enters every gathering by hand." `rhythmDates` sits deliberately just underneath that
  line — it removes the retyping without introducing recurrence, exceptions, cancellations or a
  scheduler.
- **Never a schedule.** One next thing per context, never a list of a context's dates.

---

## The alternatives for the remaining gap

| Option | Verdict | Trade-off |
|---|---|---|
| A. Leave it — a room is a place you go | Defensible | The asymmetry stands: a church you follow outranks a room you joined, which is backwards |
| **B. Room gatherings reach Home, bounded by the four-day wall** | **Recommended** | Reuses an existing rule and an existing card shape; a week where several rooms meet does produce several rows |
| C. One combined "this week" row | Not recommended | Collapsing several rooms into one row is a schedule wearing a single card, and loses the one-tap-into-notes that makes the church card useful |
| D. Fold into Suggested | Not recommended | A gathering you committed to is not a suggestion, and the shelf's cooldowns would let you "not now" an actual commitment |

---

## Option B in detail

**Goal:** the front page tells you what you have committed to this week, on the same terms
whatever kind of room it is.

**Build:**
- Reuse `useSpaceComingUp` per joined gathering space, or add one aggregate read — the endpoint
  is already membership-gated, so no new authorization question.
- Render with the existing card shape. `PrototypeHomeThisSunday` is the precedent and should be
  the pattern, not a second design: same one-tap-into-notes, same eyebrow grammar.
- **Bound by the wall, not by a count.** `SERVICE_GRACE_DAYS = 4` already governs both how long a
  past service stays visible and how far ahead the church card looks, and it is not arbitrary —
  its comment ties it to the engagement research behind harvous.com/about, and says outright: do
  not tidy this number. A room whose next gathering is nine days out simply does not appear.

**Why no cap:** a cap hides a gathering you agreed to attend, which is worse than a busy Monday.
If someone is in five rooms that all meet Tuesday, five rows on Tuesday is *true* — and the wall
means it is Tuesday's problem, not every day's.

**Reuse:** the card, the wall, the membership-gated endpoint, and the note-seeding path all
already exist. This is a placement decision, not a new surface.

**Done when:** a member of a churchless shared space that meets this week sees it on Home,
gets one tap into notes on it, and sees nothing at all in a week the room does not meet.

---

## The question that is genuinely Derek's

Everything above follows from one call, and it is the product conversation the plan flagged:

> **Is Home a place that tells you what is next across every context you are in, or is it your
> own study and nothing else?**

Today it is a hybrid, and the hybrid is uneven rather than principled: the church gets a card,
rooms do not, and the difference traces to build order rather than to a decision. Option B
resolves it toward "what is next across your contexts". The opposite resolution — Home is yours
alone, rooms are places you visit — is also coherent, and would mean **removing** the This Sunday
card rather than adding siblings to it.

I recommend B, but A-by-way-of-removal is the honest alternative and should be rejected
deliberately rather than by default.

---

## Risks / watch-items

- **Fifteen docs already cover this area** and several carry status lines that are now wrong —
  the Aug-16 audit found `CHURCH_STUDY_MATERIAL_LINKING.md` claiming "not built" when the
  `ChurchServicePublishedNotes` table (`schema.ts:1983`) said otherwise. That audit's own citation
  for it has since drifted by fifty lines, which is the argument for citing symbols alongside
  line numbers. Anything landing here should correct the status line of the
  doc it touches rather than adding a sixteenth description of the same system.
- **`SPACE_MEETING_RHYTHM_AND_CALENDAR.md` owns the adjacent questions** — multiple meeting days,
  in-person/online, timezone, calendar export — and explicitly does *not* cover this one
  ("nothing here schedules, reminds, or recurs"). Keep the boundary: that doc is about the
  rhythm's shape, this one is about where the rhythm is seen.
- **Home is already busy.** Continue, Suggested, This Sunday, From your church. Adding a row type
  needs checking against a populated fixture, not an empty account.
- **`kind='content'` still has the weaker output.** A channel's plan promises that attaching a
  study to a service makes the congregation find it; the attach-at-publish control and the
  congregant read path were the open half of that inversion. Out of scope here, but it is the
  other place the planner writes rows whose destination is thin.
- **No native equivalent.** The church hub and space views exist natively in part; a Home
  gathering row would need a Swift answer, unlike the reader work.

---

## Related docs

- `docs/future/CHURCH_SPACE_PLANS_AND_SERVICE_TIMES.md` — the parent decision, and §1's doctrine
- `docs/future/SPACE_MEETING_RHYTHM_AND_CALENDAR.md` — the rhythm's shape; deliberately not this
- `docs/future/SPACE_MODES_PRODUCT.md` — what a space *is*, and the ownership rules
- `docs/future/STUDY_PLANS.md` — what a plan becomes once it is published
- `docs/future/CHURCH_STUDY_MATERIAL_LINKING.md` — the `kind='content'` output, still half-built

---

## Decision log

| Date | Decision | Rationale |
|---|---|---|
| _pending_ | | |
