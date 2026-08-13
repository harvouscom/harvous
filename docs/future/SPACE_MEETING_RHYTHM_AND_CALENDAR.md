# Space meeting rhythm — multiple days, meeting kind, and calendar

**Status:** Scoping doc, nothing built beyond Phase 0. Extends
[CHURCH_SPACE_PLANS_AND_SERVICE_TIMES.md](./CHURCH_SPACE_PLANS_AND_SERVICE_TIMES.md)
(the parent decision) and touches the anti-goal recorded in
[MY_CHURCH_SIDEBAR.md](./MY_CHURCH_SIDEBAR.md) Layer 3.

---

## Phase 0 — what already shipped

`Spaces.meetingDay` / `Spaces.meetingTime` existed for a month with **readers on
three surfaces and no writer anywhere**. August 13, 2026 gave them one: asked at
space creation, editable in Space settings, shown in the About card, and used by
the Planner to anchor its week columns.

That is deliberately the smallest honest version. It stores **one day, one time,
no timezone**, and the schema says why in as many words: *display and defaults
only — nothing here schedules, reminds, or recurs.*

Everything below widens that promise, and the widenings are not the same size.

---

## The four asks, separated by cost

| Ask | Real cost | Blocked by |
|---|---|---|
| Better day/time control | UI only | — |
| **Multiple days** | One table migration | — |
| **In-person / online toggle + meeting link** | Two columns | — |
| **Calendar sync** (Google / Outlook / iCal) | New product surface | Timezone, and a doctrine call |

They are listed in the order I would build them. The first three are
independent; the fourth needs a decision before it needs code.

---

## Phase 1 — multiple days

### The precedent already exists, and it is exact

`ChurchServiceTimes` was created for this problem one level up. Its docblock:

> Conflating them made a two-service Sunday inexpressible — a church preaching
> one sermon at 9:00 and 10:45 had to pretend it had a single service.

`Spaces.meetingDay` has the same defect one scope down: a group that meets
Sundays **and** Wednesdays has to pretend it meets once. So the fix is not a
wider column (a comma-joined `meetingDays` string, a `jsonb` array) — it is the
row shape the church side already uses.

### The migration to copy

`ChurchServices` already made this exact move: it started keyed on `churchId`,
then went `churchId` **nullable** + `spaceId` added, so one table serves the
church's plan and a room's plan without a parallel system. Do the same to
`ChurchServiceTimes`:

- `churchId` → nullable, `spaceId` → added, exactly one of the two set.
- Unique index becomes `(churchId, spaceId, dayOfWeek, startTime)`.
- `label` and `sortOrder` come along free — "Morning" / "Evening" is a real
  thing for a room that meets twice, and nobody has to invent it later.

`Spaces.meetingDay` / `meetingTime` then become the **denormalized first slot**
(cheap reads for the Coming-up card and the Planner anchor, which both want one
answer), maintained by the same writer — or they are dropped and the reads join.
Decide that when writing the migration; the denormalized pair is the faster read
and the second source of truth, and this repo has been bitten by that before
(see the `channelSpaceId` post-mortem in CHURCH_STUDY_MATERIAL_LINKING.md).

**Files:** `server/db/schema.ts`, `server/routes/spaces.ts` (create + update),
`src/utils/space-meeting-rhythm.ts` (parser becomes list-shaped),
`spa/src/lib/planner-board.ts` (`buildPlannerWeeks` picks an anchor from N days),
`PrototypeSpaceComingUp.tsx`, `SharedSpaceAboutLetter.tsx`.

### The UI, which is why this got raised

Seven round chips beside a time input works for one day and falls apart for two:
a second time has nowhere to go. The shape that fits is **a row per meeting** —
day + time + optional label, with "Add another time", which is what a church's
service-times editor will need anyway. Build it once, use it in both.

The chips are still right for the **create** sheet, where asking for one day is
the honest 90% case and "add another" belongs in settings.

---

## Phase 2 — in-person vs online, and the link

Two columns, no migration risk, no timezone dependency:

- `Spaces.meetingKind` — `'in_person' | 'online' | 'hybrid' | null`.
- `Spaces.meetingUrl` — the Meet / Zoom / Teams link, validated as https and
  rendered as a link nowhere except inside the space.

**Rules worth fixing now, before the field exists:**

- A meeting URL is **not** an invite. It goes in the space, next to the rhythm;
  it never travels in an invite email, a share link, or a public join page.
  Anyone with the join link would otherwise have the room's standing video link.
- **Never auto-open, never embed.** A link, clicked deliberately.
- `'online'` makes the rhythm's timezone question urgent (Phase 3) — people join
  an online meeting from other zones, which is exactly the case a bare wall
  clock cannot serve. `'in_person'` does not: everyone is in the room.

That last line is why this phase is worth doing *before* calendar work. It is
the cheapest way to learn whether rooms here are actually distributed.

---

## Phase 3 — timezone, the prerequisite nobody asks for

`Spaces.meetingTime` is a wall clock with **no zone**, deliberately: a church's
zone lives on `Churches.timezone`, and a churchless Shared Space has none.
Today that is fine — the value only labels a card for people who already know
what "6:30" means in their own room.

A calendar event cannot work that way. An `.ics` `VEVENT`, a Google Calendar
insert, an Outlook event: each needs `TZID` or UTC. There is no honest way to
emit one from a bare "18:30".

So **Phase 4 cannot start until spaces have a timezone**, and adding one is not
a field — it changes what `meetingTime` means, and every existing row has to be
interpreted under some assumption. Options, roughly in order of honesty:

1. **Ask the owner**, defaulting to their browser zone. One question, once.
2. Inherit `Churches.timezone` for org spaces; ask for the rest.
3. Store UTC and convert. **Rejected** — the schema already refuses this for
   `serviceDate`, and for the same reason: a TIMESTAMPTZ drifts a Sunday into
   Saturday for a viewer three zones away.

---

## Phase 4 — calendar integration

### This is a new product surface, not a feature

The only third-party integrations in the app today are Clerk, Polar, and
Supabase. Google Calendar or Microsoft Graph would be **the first third-party
OAuth in the product**: consent screens, refresh-token storage and rotation,
revocation handling, Google's verification review for sensitive scopes, and a
support burden when someone's token dies quietly and their events stop.

**It is also not Connector.** [CONNECTOR_BOUNDARIES.md](./CONNECTOR_BOUNDARIES.md)
fixes Connector as read-only, permanently, outbound-only, over notes and threads.
Calendar sync writes to somebody else's system. Different SKU or bundled into
Plus — but not this one.

### The doctrine question, which comes first

[MY_CHURCH_SIDEBAR.md](./MY_CHURCH_SIDEBAR.md) Layer 3 names a congregant-facing
calendar as an anti-goal and says: *"If a congregant calendar is ever proposed
again, this is the line it crosses."* CHURCH_SPACE_PLANS amended it once, to
*"one next gathering per context you joined, never a schedule of any context."*

A calendar feed is a schedule of a context, by construction. So this needs an
explicit call, and there is a defensible narrow version:

> **A room you joined may put its own gatherings on your calendar. A church you
> are connected to may not.**

That keeps the original defence intact — congregants never receive the church's
schedule — while letting a Tuesday book club behave like a Tuesday book club.
Whether that line holds is Derek's call, not an implementation detail.

### If it goes ahead, in cost order

1. **`.ics` subscription URL** — a tokenised, revocable read-only feed per space.
   No OAuth at all; Google, Outlook, and Apple all subscribe to a URL. This gets
   ~80% of the value for ~10% of the work, and it is the right first build even
   if full OAuth follows.
2. **One-off "Add to calendar"** on a single planned gathering — a downloadable
   `.ics`, no account linking, no stored state.
3. **Two-way OAuth sync.** Only with a named reason the first two cannot serve.

A subscription feed also sidesteps the worst failure mode of two-way sync: a bug
that writes or deletes events in somebody's real calendar.

---

## Recommended order

**Phase 2 → Phase 1 → Phase 3 → Phase 4.1**, and stop there until asked.

Phase 2 first because it is two columns and it *measures the question* — if
nobody sets `'online'`, the timezone and calendar work has no demand behind it.
Phase 1 second because the multi-day table is the piece that gets harder the
longer the single-column version has data in it.

## Open questions

1. Does the anti-goal amendment above hold — a joined room may reach your
   calendar, a connected church may not?
2. Do `Spaces.meetingDay` / `meetingTime` survive Phase 1 as a denormalized
   first slot, or do the reads join?
3. Is calendar its own SKU, or Plus?
4. Do church Shared Spaces keep their own meeting times, or inherit the
   church's? (Today: their own, and `Churches.timezone` only supplies the zone.)
