# Study plans

**Status: built (Aug 2026).** This doc describes what exists. It was written because the
feature had shipped across five files and appeared in no document at all — the gap that
`CHURCH_SPACE_PLANS_AND_SERVICE_TIMES.md` and `CHURCH_STUDY_MATERIAL_LINKING.md` each
assumed the other covered.

A **study plan** is a sequence of steps a room walks together: week one, week two, week
three. It is the thing a church hands its congregation when a series is more than one
sermon.

---

## What it is made of

A study plan is not a new entity. It is a `Threads` row with `mode='sequence'`
(`schema.ts`), whose `sequenceNoteIds` orders the steps, and whose steps are ordinary
notes. Everything below is about how such a Thread gets built, delivered, and read.

| Concept | Row |
|---|---|
| The plan | `Threads` with `mode='sequence'` |
| Its order | `Threads.sequenceNoteIds` |
| A step | a `Notes` row, joined via `NoteThreads` |
| The series it came from | `ChurchSeries`, pointing back via `publishedThreadId` |
| Which week a step teaches | `ChurchServicePublishedNotes` |
| Who has walked how far | `ThreadProgress` |

---

## How one is made

`publishSeriesAsStudyPlan` (`server/utils/church-series-publish.ts`) turns a **series**
into a study plan. A series is a run of plan rows — eight weeks of Romans — and publishing
it mints one step note per week, in plan order, seeded with that week's passage.

Three properties worth knowing before touching it:

- **It never mints a second Thread.** `ChurchSeries.publishedThreadId` is the record that
  a series already published, and republishing appends the weeks that are missing rather
  than starting again.
- **A step claims its week.** Each published step writes a `ChurchServicePublishedNotes`
  row, and `publishedWeekIdsInThread` reads exactly those rows to decide what a republish
  should skip. That table has a second writer — see "Attached material" below — and the
  two are deliberately kept off each other's rows.
- **It pins only into a vacancy**, so publishing can never demote whatever Thread the room
  already had pinned.

---

## Where one can live

Originally shared spaces only. Ministry channels — the `type='public'` broadcast rooms
that are the documented delivery mechanism — refused sequences outright under
`CHANNELS_READ_ONLY_PILOT`.

**That flag is gone (Aug 2026).** A channel can now carry a study plan, which is what
makes the feature reach a congregation at all. Followers stay read-only **by
construction** rather than by the flag: `canAuthorInSpace` (`server/utils/space-access.ts`)
already restricts authoring in a `public` space to leader-or-owner, and a congregant who
follows a channel holds `member`.

---

## Attached material

Separately from *being* a study plan, published material can say which service or series
it accompanies — the inversion designed in
[CHURCH_STUDY_MATERIAL_LINKING.md](./CHURCH_STUDY_MATERIAL_LINKING.md): **material claims
the service; the service does not point at a room.**

- Staff attach in the channel ("Published for"), at either grain — a week
  (`ChurchServicePublishedNotes`) or a whole run (`ChurchSeriesPublishedNotes`).
- Congregants read it as a list under "This Sunday", never one button: several ministries
  can legitimately speak to the same Sunday.
- Every claim is re-resolved on read — still present, still a live ministry channel in
  this org — so a converted or deleted room drops its rows rather than surfacing a dead
  link.

`server/utils/church-published-material.ts` owns both directions.

---

## What a member sees

`listGroupStudyThreadsForSpace` shows members only the **pinned** Thread, which is correct
for a channel: a broadcast room hands out the current study, not a library of past ones.

`ThreadProgress` records which steps a person has opened. Two limits are deliberate and
still true:

- **Only opened.** There is no completion state — no `completedAt`, for a person or a
  cohort. A plan has no finish.
- **Only the leader reads the aggregate**, and a member cannot see their own progress
  summarised. "Review is never shared" is the governing rule; the surface that would show
  a person their own trail has not been built.

Progress rows are deleted with their Thread and with an expired space
(`shared-space-lifecycle.ts`). They outlived both cleanup paths until Aug 2026.

---

## The public preview

A published plan can be shared as a public page: `/shared/thread/:shareToken` →
`GET /api/shared/thread-plan/:shareToken`.

**It is the one crack in `SHARED_THREAD_NOT_PUBLIC`,** and the gate is narrow on purpose.
An ordinary shared-space Thread can never be public, because its steps are notes members
wrote and a public URL would expose their titles without consent. A published plan is the
opposite: every step is church-authored material written to be handed out. The endpoint
therefore asks the database *"did a series publish this Thread"* rather than trusting any
request field.

What the page shows: each week's title and passage, **read from the church's plan rows**
rather than from the step notes — so a member renaming a step edits the room's copy, not
the public page. A join link appears only when the room already has a live invite; the
page never mints one.

---

## Completion — built Aug 2026

`POST /api/threads/:threadId/complete` (the member) and `POST /api/threads/:threadId/close`
(the leader). A contract suite — `server/routes/__tests__/study-plan-completion.test.ts` —
asserts the property the whole design rests on: **each route touches only its own column.**


**Two completions, and they are different facts.** A person finishing their own walk through
a plan, and a leader closing the run for the room. Both exist; **neither writes the other.**

| | Who says it | Where it lives | What it means |
|---|---|---|---|
| **Individual** | the member, explicitly | `ThreadProgress.completedAt` | "I finished this" |
| **Cohort** | the room's leader | the plan Thread itself | "we're done with this study" |

Why both, and why separate:

- **Explicit, not derived.** Completion is a claim the member makes, not something inferred
  from having opened every step. `ThreadProgress` records *opened* and its docblock is careful
  not to conflate that with read; deriving completion would quietly undo that care.
- **A leader closing the run must not mark anyone complete.** Someone who fell behind did not
  finish just because the room moved on, and recording that they did would be the app telling
  them something untrue about their own study.
- **A member finishing must not close the run.** Obvious in the other direction, and the reason
  these cannot share a column.
- **"Review is never shared" is unchanged.** A member may see **their own** completion; the
  leader sees the same aggregate shape they see today. Individual completion is never exposed
  per-person to staff — that is the existing rule, and this adds no exception to it.

Still open: whether a closed run hides the plan from the room or only labels it. Labelling is
the smaller move and the one to start from.

## Personal reading plans — built Aug 2026

A personal plan is a `Threads` row with `mode='sequence'` and no `spaceId`. The server always
built them; nothing rendered them, because `useThreadNotes` was gated on a `spaceId` **the
endpoint never took** — it resolves the space itself from the Thread, so the gate guarded
nothing and cost the whole feature.

**Both surfaces.** The plan lives in the Threads list like any other thread, *and* Home
surfaces only the current step (`GET /api/threads/reading-plans` → `PrototypeHomeReadingPlan`).
The split matters — the list is where you find it, Home is where you continue it, and Home
showing the whole plan would make it a second reading list rather than an appointment. Same
division "This Sunday" draws. A completed plan drops off Home; it is not something to continue.

## Known gaps

- ~~Space plans do not reach Home~~ — **built Aug 2026** (P3). The church card plus one card per
  joined ministry with a plan, one service each, bounded to the coming week.
