# Church study material linking

**Status:** design only — the model below is decided, not built. The thing it replaces
(`ChurchServices.channelSpaceId`) was **removed entirely in Aug 2026**: column, staff
picker, and congregant link. Nothing fills that gap today; the inversion below is what
will. The "What shipped" section is kept as the diagnosis that led here.

How a congregant looking at "This Sunday" finds the study material their church
published for it. Companion to
[PASTOR_FEATURES_ROADMAP.md](./PASTOR_FEATURES_ROADMAP.md) (items 7, 9, 11) and
[CHURCH_CONNECTION_SYSTEM.md](./CHURCH_CONNECTION_SYSTEM.md) §3.

**Scope split with
[CHURCH_SPACE_PLANS_AND_SERVICE_TIMES.md](./CHURCH_SPACE_PLANS_AND_SERVICE_TIMES.md).**
That doc now owns the *recurring-room* question — which ministry gathers, when, studying
what — and answers it with per-space teaching plans, which is what `channelSpaceId` was
really being abused for. This doc keeps the *content* question: attaching a specific
published item to a specific service. The inversion below is unchanged and gets stronger,
because a claim can target any plan row (Youth's Wednesday, not only the church's Sunday).
**`channelSpaceId` is gone** (removed Aug 2026, ahead of the timeline this doc
originally set). It was surfacing an orphaned "Study material in <channel>" line under
the This Sunday card, and once a channel could carry its own teaching plan the pointer
was competing with the real thing. Column, staff picker, and congregant link all deleted;
nothing has replaced it yet, and the inversion below is what will.

---

## What shipped, and why it is the wrong shape

`ChurchServices.channelSpaceId` (v2.20.0) — a nullable pointer from **one
service** to **one ministry channel**. Staff pick it from a dropdown in the
service editor; congregants get a button under the This Sunday card that
switches them into that channel.

Four things are wrong with it, in increasing order of depth.

**1. The name came from a different concept.** Both
`CHURCH_CONNECTION_SYSTEM.md:178` and `PASTOR_FEATURES_ROADMAP.md:24` define
channels as "one space per ministry or study context (adult ed, students,
**sermon series companion**, leader resources)". There, *companion* modifies
**channel** — it names a kind of room, one that exists to accompany a series.
The v2.20.0 field reused the word for a **pointer between a service and any
existing ministry channel**, which is a different relationship. The label
survived; the meaning didn't. A church's Youth channel is not a companion
channel — it is the youth ministry's standing channel being borrowed as one.

**2. It points at a container, not at content.** "Study material" promises
material *on this sermon*. The link delivers a room, whose top item is whatever
that ministry posted most recently. The pointer's precision (one service) does
not survive the destination's breadth (a whole channel). The existing code
already fights this: `PrototypeHomeThisSunday` refuses to tint the card by the
channel's colour, because that would imply the sermon came *from* there.

**3. It is at the wrong grain.** `seriesTitle` is a text column, not a row — a
series is not an entity, so nothing can attach to one. The companion pointer
sits on the *service* because that is the only row available to hang it on, not
because that is where it belongs. In practice a pastor planning eight weeks of
Romans picks "Youth" eight times, for a relationship that changed once.

**4. The wrong person is authoring it.** The lead pastor fills in the dropdown,
but the youth pastor is the one who knows whether Youth has anything on Romans 8
this week. Curation sits with whoever plans the service; knowledge sits with
whoever makes the material.

It also front-ran a decision the roadmap had deferred on purpose — *"attaching
resources to a service is deliberately still unbuilt — that is Resource Library
territory"* — in the weakest available form.

---

## The decision: invert the relationship

**Material claims the service. The service does not point at a room.**

Published material in a ministry channel carries a reference to the service (or
series) it accompanies. "This Sunday" renders what is actually attached.

Why this and not a better dropdown:

| Problem | How inversion answers it |
|---|---|
| Points at a container | The reference is on a specific published item, so the congregant gets its title, not a room |
| One channel per service | Any number of ministries can attach to the same Sunday — Adult Ed *and* Students *and* leader notes |
| Wrong author | The youth pastor attaches the youth material, at the moment they publish it |
| Name means nothing | There is no "companion" to name — an item is *for* a service, which is a relationship anyone can read |

There is precedent in the schema already: `Notes.startedFromServiceId` is
exactly this shape for a congregant's own note. Inversion applies the same
lineage idea to staff-published material.

---

## What it needs

- **An attach control at publish time**, in the ministry channel — "what is
  this for?" — offering the church's upcoming services and series.
- **A read path** from a service to everything attached to it, org-scoped and
  re-checked as a ministry channel on the way out, the way `channelSpaceId` is
  resolved today in `server/routes/church.ts`.
- **A congregant surface that is a list, not one button.** Zero attached is the
  common case and must still render nothing.
- **Grain: both.** Attach to a *service* (this week's discussion guide) or to a
  *series* (the eight-week study). Series-level attachment requires promoting
  series from a repeated string to a row first — **now decided**, as
  `ChurchSeries` in `CHURCH_SPACE_PLANS_AND_SERVICE_TIMES.md` §9: plan-scoped
  row, `ChurchServices.seriesId` replacing `seriesTitle` outright, gated by the
  plan's own gate. Attach at the series grain points at `ChurchSeries.id` and
  must respect that scope — a church-plan attachment is not a space-plan one.
  `MY_CHURCH_SIDEBAR.md:62`'s deferred "this series channel" idea lands on the
  same row.

**Privacy is unchanged and non-negotiable.** Attaching is staff → church-wide,
writes no per-user rows, and nothing in this feature may read who opened or took
notes on what. See "Review is never shared" in the roadmap.

---

## What happened instead (Aug 2026)

The words were corrected first — the `Study material ▸ Youth` caret went, since it
borrowed the grammar of a path for a relationship with no hierarchy, and both surfaces
were made to say the same thing. Then the whole pointer was removed rather than frozen:

- Once a ministry channel could carry **its own teaching plan**, a sermon pointing at a
  channel was competing with the real relationship rather than standing in for it.
- The congregant surface it drove was structurally orphaned — a bare line between two
  cards, because the This Sunday card is a single `<button>` and a button cannot contain
  one. Whatever replaces it must have a real home in the card, not be a sibling of it.
- Keeping it visible taught a pattern this document exists to replace.

So there is no migration input for the inversion, and no pointer left to rename.

## Do not

- **Do not tint the This Sunday card by the channel's colour.** It implies the
  sermon came from that channel. Already settled once.
- **Do not add a second single-pointer field** (e.g. `resourceNoteId`) as a
  cheaper half-step. That is how `channelSpaceId` happened.
- **Do not build a bulletin.** Channels are study contexts, not announcements —
  the lead metaphor is settled in `CHURCH_CONNECTION_SYSTEM.md` §3.
