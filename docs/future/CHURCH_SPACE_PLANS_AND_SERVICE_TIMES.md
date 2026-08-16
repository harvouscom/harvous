# Church space plans, service times, and the Home card stack

**Status:** P1, **P2 and P5 built**, plus **series-as-a-row (§9)** and **aggregate
engagement (§10)** (Aug 2026); P3–P4 design only. Decided August 2026. Companion to
[CHURCH_STUDY_MATERIAL_LINKING.md](./CHURCH_STUDY_MATERIAL_LINKING.md),
[MY_CHURCH_SIDEBAR.md](./MY_CHURCH_SIDEBAR.md), and
[PASTOR_FEATURES_ROADMAP.md](./PASTOR_FEATURES_ROADMAP.md) (items 7, 9, 10, 11).

**Where this goes next:**
[SPACE_MEETING_RHYTHM_AND_CALENDAR.md](./SPACE_MEETING_RHYTHM_AND_CALENDAR.md) —
multiple meeting days, in-person/online + meeting link, the timezone this design
deliberately does without, and whether a room may reach a member's calendar.

---

## Why this exists

The doctrine already says the hierarchy is **church > (church Shared Spaces | ministry
channels) > content**. Curriculum lives in spaces; note templates are scoped to a space
*or* an org; membership is per-space. The teaching plan is the **one** church feature
still hanging off the church directly — `ChurchServices` is keyed on `churchId` with no
space dimension at all.

That gap is what produced the `channelSpaceId` mess diagnosed in
[CHURCH_STUDY_MATERIAL_LINKING.md](./CHURCH_STUDY_MATERIAL_LINKING.md): with nowhere to
put "Youth meets Wednesdays and studies this," a pastor was reduced to pointing the
church's Sunday row at the Youth channel, once per week, forever.

This design closes the gap: the plan moves *down* to where every other church feature
already lives, without moving the church's own Sunday plan anywhere.

---

## 1. What this decides

1. **Space plans.** The church keeps its church-level teaching plan (main Sunday
   services). Any org space — ministry channel (`type='public'` + `orgId`) or church
   Shared Space (`type='shared'` + `orgId`) — **may** additionally carry its own plan.
   Space plans surface inside the space; the church plan stays where it is.
2. **Home card stack.** The church's service card is unchanged, and below it each ministry
   the congregant has joined that has a plan gets **its own card** showing that context's
   next gathering. Nothing competes for one slot; each card shows exactly one service. §5.
3. **Time model.** A church settings surface stores an IANA timezone plus a default
   meeting day and time. Plans may override the day/time. Service rows inherit. The
   editor's date picker default follows it, replacing the hardcoded `nextSunday()` in
   `PrototypeServiceEditorSheet.tsx`. Times are **display and defaults only**.

### Doctrine amendment — on the record

**"A congregant gets the appointment, not the schedule" is AMENDED, not repealed.**

`MY_CHURCH_SIDEBAR.md` locks a congregant to exactly one service and names a calendar as
the line never to cross: *"If a congregant calendar is ever proposed again, this is the
line it crosses."*

What that doctrine was defending against is a congregant seeing **the church's schedule** —
a quarter of Sundays, a "coming up" list, a series page. This design does not do that.

What it does do: the church card is unchanged, and each ministry the congregant has
*deliberately joined* gets its own card reporting **its own next gathering** — one service,
never a list. Home is already a stack of one-thing-each cards; these join it.

So the amendment is: **one next gathering per context you joined, never a schedule of any
context.** Tested against the original concern, that is not a calendar — nobody is shown a
sequence of anything.

**The new line: any card that shows more than its own next gathering.** A "coming up" list,
a second service from the same context, a series index — any of those is the crossing, and
should be argued against this paragraph. The count of cards is not the line; the count of
services *per card* is.

Two fences keep it honest: only spaces whose staff actually built a plan produce a card,
and a context card only appears when its gathering falls inside a narrow window around
today (§5).

### Doctrine amendment — granted space leadership

**"Congregants never receive role surfaces" is AMENDED, narrowly** (Derek, Aug 2026).

`PASTOR_FEATURES_ROADMAP.md` states that congregants — `connectedChurchId` only, never
Clerk org members — never receive role surfaces. That was written when the only way to
hold authority in a church space was to be one of the ≤20 Clerk staff.

The amendment: **a connected congregant who has been explicitly granted leadership of one
space receives role surfaces for that space, and nowhere else.** Not a default, not
inferred from following, not church-wide — an act of granting, revocable, scoped to a
single room.

What a granted space leader **can** do: author in that space (which for a ministry channel
means publish — see §4), manage that space's structure, and author that space's teaching
plan and meeting defaults.

What a granted space leader **can never** do: hold any `ChurchCapability`, touch the
church-level plan, manage staff, manage billing, provision org templates, join the Clerk
org, or affect any space they were not granted. The ≤20 Clerk cap and "congregants never
join the Clerk org" both stand unchanged.

**The new line: church-wide authority stays Clerk-only.** If a space grant is ever proposed
as a route to a church capability, that is the crossing.

### The fence around times

Times are **display and defaults**. No reminders, no notifications, no recurrence engine,
no room booking, no attendance. `defaultServiceDay` never *generates* service rows — it
pre-fills a date picker and labels a card, nothing more. A pastor still hand-enters every
service.

Scheduling, facilities, and ChMS remain anti-goals (`MY_CHURCH_SIDEBAR.md` anti-goals;
`CHMS_INTEGRATION_RESEARCH.md` explicit non-goals, which name volunteer scheduling and
worship planning). This fence must be restated in every phase that touches time.

### Invariants that must survive every phase

- **"Review is never shared."** `resolveViewerServiceNotes` stays the only reader of
  `Notes.startedFromServiceId`, always scoped to the viewer's own `userId`. Space plans
  add **zero** church-facing reads of note lineage. The contract tests asserting no route
  file contains `startedFromServiceId` and no route groups by service stay green.
  **Strengthened Aug 2026** by aggregate engagement (§10): the suite now greps the whole
  server for the column and fails on any reader outside a short allowlist, so the guarantee
  no longer depends on remembering to add each new file to a list of checked ones.
- **Staff before sponsorship.** A signed-in stranger must never learn whether a church has
  lapsed. Every new gate composes the existing private helper in
  `server/utils/church-teaching-plan.ts` rather than re-implementing the order.
- **Lapsing gates writes only.** A lapsed church keeps every read, including space plans.
- **Congregant routes never take an `orgId` or `spaceId` from the request** for scoping.
  Every context-card source derives from the viewer's own `UserMetadata.connectedOrgId`
  and `SpaceMemberships`. The existing contract test forbidding `orgId` params extends to
  forbid `spaceId` params.
- **≤20 Clerk staff; congregants never join the Clerk org.**

---

## 2. Schema

### 2.1 Space plans: `ChurchServices.spaceId`, not a second table

**Add a nullable `spaceId` to `ChurchServices`. `NULL` = the church-level plan.**

Why one table rather than a `SpaceServices` twin:

- The row shape is identical — date, title, series, reference, starter template. A twin
  duplicates every helper (`listServicesForChurch`, `deriveSeriesTitles`, the gate) and,
  worse, forks `Notes.startedFromServiceId` into two foreign-key spaces. One lineage
  column must point at one table.
- `resolveViewerServiceNotes` and the whole start-a-note-from-this-service flow work on
  space services **for free**. A note started from a Youth Wednesday is the same lineage
  shape as one started from Sunday.
- Precedent, with an honest difference: `NoteTemplates` is the existing two-scope feature,
  but it keeps scopes *disjoint* (`userId`-only XOR `spaceId` XOR `orgId`, enforced by a
  route-level `INVALID_SCOPE`). Here `churchId` is **always** set and `spaceId` *narrows*
  — a hierarchy, not a disjunction. That is simpler and it is correct: a space plan is
  still the church's plan, held by one of its rooms.

**The drift-pair objection, answered.** The schema comment on `ChurchServices` refuses to
denormalize `orgId` because it would cache derivable data and mint a second drift pair
like `connectedChurchId`/`connectedOrgId`. `spaceId` is not that — it is a genuine
relationship (which plan this row belongs to), not a cached copy of anything. What it does
introduce is a cross-row invariant: **the referenced space must belong to the same
church** (`Spaces.orgId === Churches.orgId`). Enforced at both ends:

- **Write:** the space-plan gate (§4) resolves space → org → church and refuses rows where
  they disagree. `spaceId` is **immutable after create** — there is no "move a service
  between plans"; delete and recreate.
- **Read:** every resolution of space rows re-joins `Spaces` filtered by
  `orgId = church.orgId AND deletedAt IS NULL AND isActive` — the same defensive pattern
  `channelSpaceId` resolution already uses. A deleted or deactivated space makes its plan
  rows *invisible*, never dead links, and never deleted.

Document this invariant in the schema comment where the `orgId` refusal currently lives,
so the next reader sees why one is refused and the other is not.

**Uniqueness: ONE partial unique index, not two.**

> **CORRECTED Aug 2026 — this section was written before service times existed.** It
> originally specified a second index,
> `ChurchServices_church_date_unique ON (churchId, serviceDate) WHERE spaceId IS NULL`,
> to preserve *"one service per church per date."* **That guarantee has since been
> deliberately retired.** A church holds a morning sermon and a different evening sermon
> on the same Sunday, so uniqueness moved down to the grain where it is actually true:
> `ChurchServiceTimeAssignments_slot_date_unique` — one sermon per *service time* per
> date. Rebuilding the church-side index here would re-forbid the ordinary
> morning/evening Sunday. Do not add it.

Postgres treats NULLs as distinct, so a naive `(churchId, spaceId, serviceDate)` unique
would behave arbitrarily across the two scopes anyway. What each scope needs differs:

| Scope | Guarantee | Where it lives |
|---|---|---|
| **Church plan** (`spaceId IS NULL`) | One sermon per *service time* per date — several sermons per date are legal | `ChurchServiceTimeAssignments_slot_date_unique`, plus a route guard refusing two *timeless* sermons on one date |
| **Space plan** (`spaceId IS NOT NULL`) | One gathering per date — a space has a single `meetingTime`, not a slot list | The partial unique index below |

```
ChurchServices_space_date_unique  ON (spaceId, serviceDate)  WHERE spaceId IS NOT NULL
```

`ChurchServices_church_dateIndex` stays a **plain** index — it exists for query planning,
not for uniqueness. The repo already ships a partial unique (`Threads_onePinnedPerSpace`),
so drizzle-kit support is proven in-repo; still **verify drizzle-kit emits the `WHERE`
clause** before trusting the migration. All existing rows have `spaceId NULL`, so adding
the space index cannot fail on current data.

**Why spaces get a hard index where the church gets a route guard.** Space rows can never
claim a church service time — those slots belong to the church (§4 write rules) — so every
space row is "timeless" and the DB can carry the whole invariant. The church side cannot,
because its answer depends on the slots a sermon claims.

**The biggest hazard in this design — safe-by-default helper migration.** The moment
`spaceId` exists, `listServicesForChurch(churchId)` silently starts returning space rows
into every existing surface, including the congregant card. The helper must change
signature **in the same commit as the column**:

```ts
listServicesForChurch(churchId, { plan: { spaceId: string | null }, from, limit })
```

with the church plan (`spaceId IS NULL`) as the **default filter**, so any un-migrated
call site gets today's behaviour rather than a silently merged plan.

`deriveSeriesTitles` stays a pure transform but is fed per-plan rows only — Youth's series
autocomplete and the church's stay separate vocabularies, which is the point.

**`channelSpaceId` has since been removed entirely** (Aug 2026), earlier than this
section planned. Once a channel could hold its own plan, a sermon pointing at a channel
was competing with the real relationship — and the congregant surface it drove was an
orphaned line floating between two cards. What follows is kept as the reasoning; the
"do not repurpose it" warning still stands for anything that tries to bring it back.
Repurposing a pointer meaning "study material lives over there" into "this row belongs to
that plan" would silently corrupt meaning on every existing row. It freezes at P2 and dies
at P4 (§6). The write route should **reject `channelSpaceId` on rows where `spaceId` is
set** — a space plan does not point at another room.

### 2.2 Time and timezone columns

**On `Churches`** — a new, clearly commented block: *self-serve church configuration,
written ONLY by `POST /api/church/settings/update`; never by HMC refresh or admin denorm
paths.* Physically and conceptually separate from the HMC denorm trio.

| Column | Type | Null | Written by |
|---|---|---|---|
| `timezone` | `text` — IANA name, e.g. `America/Chicago` | yes (null = unset) | Church settings |
| `defaultServiceDay` | `integer` — 0–6, 0 = Sunday (matches `Date.getDay()` and the `WEEKDAYS` array in `church-services.ts`) | yes (null = Sunday fallback, preserving today's `nextSunday()`) | Church settings |
| `defaultServiceTime` | `text` — `'HH:MM'` 24h, `/^([01]\d|2[0-3]):[0-5]\d$/` | yes (null = no time shown anywhere) | Church settings |

Timezone validated server-side against `Intl.supportedValuesOf('timeZone')` (or a
try/catch `Intl.DateTimeFormat` probe).

**HMC-denorm safety — verified, and pinned.** `hmcDenormFields` returns exactly
`{name, city, state, country}`; both the refresh route and the sync job spread only those
keys plus `updatedAt`. Config columns therefore survive every refresh **today**. To keep
that true, add a unit test pinning `Object.keys(hmcDenormFields(sample))` to exactly those
four, with a comment naming the config block as the reason it matters.

**On `Spaces`** — the per-plan override:

| Column | Type | Null | Notes |
|---|---|---|---|
| `meetingDay` | `integer` 0–6 | yes | Meaningful only on org spaces carrying a plan |
| `meetingTime` | `text 'HH:MM'` | yes | Same |

On `Spaces` rather than a per-plan settings table because **there is no "plan" entity** — a
plan is just the set of `ChurchServices` rows sharing a scope — and a new table for two
nullable scalars is ceremony. The church plan's overrides *are* the `Churches` columns, so
"each plan may override" is satisfied with no extra storage.

Relationship to `publishCadence`: **none, functionally.** `publishCadence` is declared
*publishing* intent driving channel-freshness copy; `meetingDay`/`meetingTime` are
*gathering* defaults. They coexist. The schema comments must say so explicitly — two
adjacent "when" concepts on one table is a real confusion risk (§8).

**Timezone is not per-space.** One church, one clock. Multi-campus churches spanning zones
are out of scope.

### 2.2b `SpaceMemberships.grantSource` — the landmine defuser

Granted space leadership (§1 amendment, built in P5) collides head-on with staff sync.
`computeStaffSyncPlan` deletes **any** `leader` row whose user is not in the Clerk roster,
and sync runs on the `organizationMembership.*` webhook plus every staff invite, removal,
and role change. A hand-granted volunteer leader would be silently reaped, probably within
a day.

Add a nullable column:

| Column | Type | Null | Semantics |
|---|---|---|---|
| `grantSource` | `text` — `'staff_sync'` \| `'grant'` | yes | `NULL` reads as `'staff_sync'` |

Sync's removal step gains `AND grantSource IS DISTINCT FROM 'grant'`. No backfill is
needed: every `leader` row that exists today *is* staff-projected, and NULL already means
that. Nothing else reads the column.

**Land this column and the sync guard in P2, not P5** — a phase before the feature that
needs it. It is one nullable column and one SQL predicate, it is a no-op until the first
granted row exists, and it means the P5 author cannot forget the reaping rule. This is the
cheapest possible insurance against a data-loss bug that would be invisible in testing
(sync has to fire before it bites).

Rejected alternative: inferring provenance from the existing nullable `invitedBy`
(staff-sync inserts leave it null). Relying on a null to mean "system-created" is exactly
the implicit rule that breaks the first time someone inserts a row by another path.

**On `ChurchServices`:**

| Column | Type | Null | Semantics |
|---|---|---|---|
| `serviceTime` | `text 'HH:MM'` | yes | **`NULL` = inherit** |

Resolved at read time as `serviceTime ?? space?.meetingTime ?? church.defaultServiceTime`.

Null-means-inherit rather than copy-on-create: if the pastor moves the service from 10:30
to 9:00 in settings, every future card updates without a backfill, and the editor can show
an honest placeholder ("10:30 — church default") instead of a value nobody typed. **The
server resolves the chain** and ships a single resolved string; clients never re-derive
the inheritance.

### 2.3 What congregants see: church wall-clock time, never converted

**"This Sunday · 10:30 AM" renders the church's own wall-clock time as a plain string. It
is never converted to the viewer's timezone.**

This is the same doctrine that made `serviceDate` a text column rather than a timestamp: a
service is a day — now a day and a clock reading — on the *church's* wall calendar.
Converting would tell a travelling congregant their church meets at 8:30 AM Saturday,
which is false in every sense that matters, and would reintroduce exactly the timezone
maths this codebase deliberately has none of.

The stored IANA `timezone` makes the stored `'HH:MM'` **unambiguous** — it records whose
clock — and keeps future options open. In v1 its only rendering use is an optional short
label on **staff** surfaces ("Central Time" under the settings fields). Congregants see
the bare time. Clients format `'10:30'` → `10:30 AM` with string maths, constructing no
`Date`.

---

## 3. Church settings surface

The **first self-serve `Churches` writer** — today every church-record write goes through
`requireHarvousAdmin`.

**Capability: a new `manage_church_settings`, granted to `org:admin` only.** Chosen over
reusing `manage_billing`: capabilities are the contract clients render surfaces from, and
"billing" gating a timezone picker misleads every future reader while foreclosing the
option of granting settings to a pastor without also granting them the money. The cost is
one entry in `CHURCH_CAPABILITIES` and one line inside the existing `ROLE_ADMIN` branch of
`capabilitiesForChurchRole`. Widening to pastor later is a one-line change.

**Routes:**

- `GET /api/church/settings` — **staff read**, never sponsorship-gated. Any staff member
  may see the church's timezone and defaults; nothing here is sensitive and teachers need
  the context.
- `POST /api/church/settings/update` — church exists → active → staff → **sponsored (402
  on lapse)** → Clerk role → `manage_church_settings`. The same ordering as
  `resolveTeachingPlanAccess`; implement as a third access rule through that same private
  helper, or a sibling carrying the identical ordering comment. Payload
  `{ timezone?, defaultServiceDay?, defaultServiceTime? }`; explicit nulls clear a field.

**UI:** a fourth **"Church settings"** row in the hub's Tools group;
`toolsView` gains `'settings'` alongside `'catalog' | 'teaching-plan' | 'team' |
'starters'`. Fields: searchable IANA timezone picker, day picker, time input. Rendered
only when the capabilities payload says `manage_church_settings` — never re-derived from a
role string.

**Editor default replacement:** `nextSunday()` becomes
`nextOccurrenceOfDay(plan.meetingDay ?? church.defaultServiceDay ?? 0)`, computed on the
staff device's local calendar exactly as today (wall-calendar doctrine — no timezone maths
in the picker). The plan and staff payloads must carry the resolved defaults down to the
sheet.

---

## 4. Authorization for space plans

**The initial gate is the same church-wide `manage_teaching_plan`: any pastor or admin may
edit any space plan.**

This is forced, not chosen. **Per-space leadership is not expressible today.**
`syncChurchStaffForOrg` projects the entire Clerk roster as `leader` onto *every* org
space, all-or-nothing; invite creation hardcodes `role: 'member'` and rejects non-`shared`
spaces; redeem honours `'leader'` but no invite can carry it. So "youth leader but not
main-plan editor" has no substrate. It arrives with roadmap item 10 — deferred to P5, and
P2 must say plainly in its UI that any pastor or admin can edit this plan.

**Gate design** — new exports in `server/utils/church-teaching-plan.ts`, composing (never
duplicating) the existing ordering:

```ts
assertCanViewSpaceTeachingPlan(userId, spaceId)
assertCanManageSpaceTeachingPlan(userId, spaceId)
// ok shape: { ok: true; church: ChurchRow; space: SpaceRow }
```

Resolution order:

1. Load space: exists, `deletedAt IS NULL`, `isActive` — else `404 SPACE_NOT_FOUND`.
2. Must be an org space: `orgId` set **and** `type IN ('shared','public')` — else **404**,
   not 409. Do not disclose what kind of room an id names. Introduce a named
   `isChurchOrgSpaceRow` helper beside `isMinistryBroadcastSpaceRow`, ending the
   inline-checks-only status of church Shared Spaces.
3. Delegate to the existing private helper with the space's `orgId`, which preserves
   church-exists → active → **staff** → [write: sponsored] → Clerk role → capability.
   Staff-before-sponsorship survives by construction rather than by re-implementation.

**In P5 the manage gate widens to an OR**, and this is the only place it widens:

```
church-wide `manage_teaching_plan`   OR   granted leader of THIS space
```

The **church-level** plan gate never widens — it stays Clerk-capability-only, forever. A
space grant is not a route to the church's own plan.

Keep both gates a single choke point each, so P5 is one edit in one file rather than a
hunt. Everything else in P5 is described in §7.

**Contract-test extension.** The route tests string-slice source per handler and assert
gate names. Extend the table: every space-plan handler must contain
`assertCanManageSpaceTeachingPlan` (writes) or `assertCanViewSpaceTeachingPlan` (reads),
and must **not** contain the church-wide gate names — and vice versa for the existing
handlers. Add gate unit tests: non-org space → 404; cross-org write → refused; lapsed
church → 402 on manage but `ok` on view; Clerk outage → fails closed. In P5, add: granted
leader passes the space gate and is refused by the church-plan gate.

---

## 5. The Home card stack

**Decided (Derek, Aug 2026): church card, plus a stack of cards for the ministries you
follow.** Nothing competes for a single slot.

An earlier draft of this design had one card drawing from a widened source set, with the
church winning same-date ties. That was the wrong shape — it made a channel you follow
*take* something from you, and invented a competition that doesn't exist in the product.
Each context you have joined simply reports its own next gathering. The reasoning trail for
the retired model is in §8 items 1 and 4.

### The rule

- **The church card is unchanged.** The home church's next service, exactly as it works
  today — same grace window, same eyebrow, same position on Home. It stays the anchor and
  it stays first.
- **One card per context**, below it: for each org space the viewer belongs to that has a
  plan, that space's own next gathering. Each card shows **one** service — never a list.
- **Ordering:** church first, then context cards by soonest gathering.
- **The context-card window (decided, Derek Aug 2026):** a context card appears only when its selected
  service falls inside `[today − SERVICE_GRACE_DAYS, today + 7]` — i.e. the same four-day
  write-up grace the church card already gets, plus the coming week ahead. Spelled as a
  range because "within the coming week" alone says nothing about the past side, and the
  grace window is the half that makes a Thursday card for Wednesday's gathering work.

  This keeps Home a set of imminent appointments rather than a standing directory of every
  ministry's rhythm: a quarterly ministry is silent for eleven weeks instead of parked on
  Home forever. **The church card is never bounded** — it is the anchor, and it follows
  today's rules unchanged.

**Channels *and* church Shared Spaces — decided (Derek, Aug 2026), both are in.** Channels
were the motivating case ("channels you follow"), but the same rails carry a small group
you were invited into, and an invite-joined group reporting its next meeting is if anything
a stronger attendance signal than a channel follow. Any org space the viewer belongs to
that has a plan produces a card; `isChurchOrgSpaceRow` (§4) is the single predicate for
"org space," so this needs no separate rule.

### What this simplifies

`currentServiceFor` **does not change**. It is already "the one service for this set of
rows," and it now simply runs once per source group instead of once over a merged list.
No cross-source comparator, no tie-break, no new ordering rules — the risk-1 machinery is
deleted rather than built. The partial unique indexes (§2.1) already guarantee one service
per date *within* a plan, so a group can never tie with itself.

The grace window applies per context, unchanged: a Thursday card for Wednesday's Youth
gathering is the same "write up what you just heard" affordance that Monday gives Sunday.

### Payload

`GET /api/church/services` keeps its URL and its congregant scoping (church from the
viewer's `connectedOrgId` only). Each service gains:

```ts
source: { kind: 'church' } | { kind: 'space'; spaceId: string; title: string; color: string | null }
serviceTime: string | null   // server-resolved 'HH:MM', church-local
```

Both **optional** on the client type — the existing optional `channel` field is the
precedent — so payloads cached before the ship still parse, and a missing `source` is
treated as `{ kind: 'church' }`. Endpoint unchanged plus tolerant shape means no client
cache invalidation.

**Server gathering:**

1. Church plan rows: `spaceId IS NULL`, from the existing grace-window start, limit 8 —
   exactly today.
2. The viewer's org-space plans: `SpaceMemberships` for the viewer joined to live `Spaces`
   where `orgId = church.orgId` and `isChurchOrgSpaceRow`. For channels, **following *is*
   membership** (the follow route writes a `role='member'` row), so "follows or belongs
   to" is one query.
3. **The 8-row limit becomes per-source**, not global and not raised — a busy Youth plan
   must never starve the church plan out of the payload. Sources are naturally bounded by
   the viewer's org-space memberships.

Assemble, tag each row with its `source`, sort ascending by `serviceDate`, ship. Grouping
by source is the client's job.

### Client selection

Per source group, run today's `currentServiceFor` unchanged — soonest upcoming, else most
recent past inside `SERVICE_GRACE_DAYS`. Then drop any **context** card whose selected
service falls outside `[today − SERVICE_GRACE_DAYS, today + 7]`. The church card is never
dropped.

Note the two steps are not redundant: `currentServiceFor` can legitimately return a service
weeks out when a context has nothing sooner, and the bound is what keeps that off Home.

`SERVICE_GRACE_DAYS` stays 4 and stays duplicated across server and client — both sites
already carry the four-day-wall comment; change both or neither.

The regression that matters: **for a viewer with no space plans, every output must be
byte-identical to today.** Pin it with the existing week-boundary tests.

### Card presentation

- **Church card:** unchanged in every respect.
- **Context card:** the eyebrow names the context — **"This Wednesday · Youth"** — with the
  title ellipsized by CSS. Visually subordinate to the church card; it is a room you're in
  reporting its next thing, not a second appointment competing for the same status.
- The resolved time joins the meta line: "Sunday, Aug 9 · 10:30 AM".
- **Never tint a card by the space's colour.** Settled for companion channels in
  `CHURCH_STUDY_MATERIAL_LINKING.md`; the same reasoning applies here.
- Each card starts a note against its own service, so `startedFromServiceId` lineage works
  per context with no change.

---

## 6. Reconciliation with CHURCH_STUDY_MATERIAL_LINKING.md

The two designs divide cleanly once the questions are named:

- **Space plans answer the recurring-room question** — *which ministry gathers, when,
  studying what.* That is the question `channelSpaceId` was being abused for: a pastor
  picking "Youth" eight times for a relationship that changed once. A Youth plan makes
  that pointer's main use case obsolete.
- **Material-claims-service survives unchanged as the content question** — attaching a
  specific published item to a specific service. It gets *stronger* here: because space
  plans are `ChurchServices` rows, a claim can target **any** row, so the youth pastor
  attaches Wednesday's discussion guide to the Youth Wednesday service rather than to the
  church's Sunday.
- **`channelSpaceId` is already gone** — removed Aug 2026 rather than at P4. It was
  surfacing a stray "Study material in <channel>" line under the This Sunday card, and
  every day it stayed taught a pattern this design replaces. P4 therefore builds the
  claims model on a clean base, with no pointer to migrate.
- ~~**Series-as-a-row stays deferred**~~ — **superseded Aug 2026.** `ChurchSeries` is a
  row, `ChurchServices.seriesId` replaced the free-text `seriesTitle` outright, and the
  column is gone. The attach-to-series grain in P4 is what forced the decision, exactly as
  that doc anticipated it might. Space plans scope their series through the same row
  (`ChurchSeries.spaceId`), so a space plan's series is still never the church plan's.

---

## 7. Phases

Ordered so each phase ships alone, and earlier phases are worth having even if later ones
never happen.

### P1 — Church settings: timezone, defaults, service times

*Worth it alone: kills the hardcoded `nextSunday()`, puts "10:30 AM" on the card.*

- **Schema:** `Churches.timezone / defaultServiceDay / defaultServiceTime` (new config
  block with the HMC-safety comment); `ChurchServices.serviceTime`. No index changes.
- **Server:** `GET /api/church/settings`, `POST /api/church/settings/update`, new
  `manage_church_settings` capability. Congregant payload gains resolved `serviceTime`;
  staff plan payload carries the defaults.
- **Client:** "Church settings" hub row + `'settings'` toolsView; editor date default from
  the configured day; time field with the inherit placeholder; card renders the time.
- **Tests:** contract rows for the new handlers' gate names; the `hmcDenormFields`
  key-pinning test; time and `nextOccurrenceOfDay` unit tests; a capability test that
  `manage_church_settings` belongs to admin only.
- **Migration:** four nullable columns, zero backfill. All-null behaviour is byte-identical
  to today.
- **Must not break:** existing gate-name contract tests, `currentServiceFor` unit tests,
  HMC refresh paths.
- **Out of scope:** `spaceId`, context cards, per-space anything, reminders or
  notifications (the fence), viewer-timezone conversion.

### P2 — Space plans ✅ built: schema, staff authoring, in-space surfacing

*Worth it alone: Youth gets a real Wednesday plan its members can see, before Home knows.*

- **Schema:** `ChurchServices.spaceId`; drop the current unique index and create the two
  partial ones; `Spaces.meetingDay / meetingTime`; **`SpaceMemberships.grantSource` plus
  the sync-reaping guard** (§2.2b — a no-op today, landed early so P5 cannot forget it).
  Verify drizzle-kit's `WHERE` clauses.
- **Server:** `isChurchOrgSpaceRow`; the two space-plan gates; space-plan CRUD at
  `/api/church/spaces/:spaceId/services/*` mirroring the church handlers;
  `listServicesForChurch` gains the scope parameter **defaulting to church-only**; the
  write route rejects `channelSpaceId` on space rows.
- **Client:** staff authoring in the hub — the Teaching plan pane gains a plan switcher
  (Church / each org space you may plan for), reusing `PrototypeServiceEditorSheet` with a
  `spaceId` prop and per-plan series autocomplete. Congregant side: a minimal read-only
  "Coming up" strip **inside the space** showing its one next service — not a list.
- **Tests:** contract rows for the new handlers; gate unit tests (non-org space 404,
  cross-org refusal, lapse 402 on write only, Clerk fail-closed); partial-index tests
  (duplicate church-date rejected, duplicate space-date rejected, same date across scopes
  allowed); a regression pin that church-plan endpoints exclude space rows.
- **Must not break:** "This Sunday" (church plan only until P3); note-lineage tests; the
  congregant no-params contract test.
- **Out of scope:** context cards on Home; per-space leaders — church-wide
  `manage_teaching_plan` edits everything, and the UI must say so.

### P3 — Context cards on Home

*Worth it alone: the youth kid's Wednesday finally reaches Home, without taking anything
from the church's Sunday.*

- **Schema:** none.
- **Server:** aggregate per §5 — viewer memberships only, per-source limit, `source` and
  resolved `serviceTime` on every row, space rows re-checked against live spaces.
- **Client:** group by source; run the **unchanged** `currentServiceFor` per group; apply
  the context-card window (§5) — context cards only, never the church card; the context
  card variant with eyebrow attribution; missing-`source` tolerance.
- **Tests:** per-group selection (each context picks its own next service independently);
  the context-card window on both its boundaries — a gathering 8 days out is hidden, one
  5 days past is hidden, one 4 days past still shows; **the regression that matters — a
  viewer with no space plans produces byte-identical output to today**, pinned with the
  existing week-boundary tests; contract test extended to forbid `spaceId` params; a
  payload-tolerance test proving an old cached payload still parses.
- **Must not break:** the amended doctrine — one service per card, never a list. **The
  amendment wording lands in `MY_CHURCH_SIDEBAR.md` in this same PR**, replacing that
  doc's current "exactly one service" phrasing.
- **Out of scope:** any card showing more than its own next gathering; per-context dismiss
  (see §8 item 4).

### P4 — Material claims the service; `channelSpaceId` dies

Executes [CHURCH_STUDY_MATERIAL_LINKING.md](./CHURCH_STUDY_MATERIAL_LINKING.md) as
designed — attach-at-publish inside channels, a service → attached-items read path, the
congregant list replacing the button — with claims able to target **any** plan row. Then
remove the editor picker, migrate and drop `channelSpaceId`, and delete its resolution
block.

**Out of scope:** series-as-a-row, unless the attach-to-series grain forces the decision
then — in which case it gets its own doc.

### P5 — Granted space leadership (roadmap item 10)

**Decided (Derek, Aug 2026): a connected congregant can be granted leadership of a single
space** — see the §1 amendment for the boundary. Staff keep broad authority everywhere;
granted leaders are narrow authority in one room. The two models coexist rather than
replacing each other, which is why staff projection stays and only the reaping rule
changes.

**This reaches beyond teaching plans, by design.** `canAuthorInSpace` requires leader rank
to author in a `type='public'` space, so a granted leader of the Youth channel can
**publish** to it — which today requires a Clerk staff seat. That is the point, not a side
effect: it is what lets a volunteer youth leader run their own channel. It also means P5
changes the church's publishing trust model, and should be reviewed as such.

Scope:

- ~~`SpaceInvites` create accepts `role: 'leader'`~~ — **built differently (Aug 2026).**
  Leadership is granted **directly** on an existing membership rather than through an
  invite: `server/routes/church-space-leaders.ts` sets `role: 'leader'` with
  `grantSource: 'grant'` on the `SpaceMemberships` row, and revokes by the same predicate.
  The invite path was never needed — a granted leader is someone already in the room, so
  minting an invite for them would have been a second way to say a thing that had one.
- A direct promote/demote path for existing members, same provenance. **This is what shipped**,
  and it is the whole of it.
- **Who may grant:** `manage_staff` (i.e. `org:admin`) or the space's own owner. Granting
  publish rights over a channel the whole congregation follows is a real trust escalation
  — it should sit with the same people who manage the roster. Revocation must be
  first-class, not "delete the row and hope."
- The space-plan manage gate widens to the OR in §4. Church-level plan gate untouched.
- `Spaces.meetingDay`/`meetingTime` writes follow the same gate as the space's plan.
- Staff sync is **unchanged except** for the `grantSource` predicate landed in P2.

**Must not break:** the §1 boundary — a granted leader must hold zero `ChurchCapability`,
and a test should assert `capabilitiesForChurchRole` is never consulted for, nor granted
to, a non-Clerk user. Congregants still never join the Clerk org.

**Out of scope:** scoping *staff* down to specific spaces (staff stay leader everywhere —
that was the rejected option); any grant that confers church-wide authority.

**Upside worth noting:** volunteers no longer consume Clerk seats, which relieves pressure
on the ≤20 cap and makes the "unlimited staff" add-on less urgent than the roadmap assumes.

**As built (Aug 2026).** Grant and revoke live on the space's own people sheet
(`PrototypeSpacePeopleSheet`), reached through Manage channel → Followers — deliberately
*not* the church Team list, which stays the Clerk roster and must not imply a volunteer is
staff. One rule governs the row: **at most two controls, and the leader state is stated
once.** A row showing "Remove leader" needs no "Leader" tag, and a staff-projected leader
gets the tag with no toggle at all (its title points at the Team, since revoking a row the
sync owns would just be undone). The first cut broke both halves — it rendered tag +
toggle + Remove, which ellipsised the member's name to two characters, and offered the
staff-projected leader a *disabled* button reading "Make leader", the wrong verb for
someone who already leads.

---

## 8. Risks and open objections

1. **RETIRED — no longer applicable.** This was the same-date tie-break for the one-card
   model (church wins). The card-stack decision removes cross-source competition entirely,
   so there is nothing to tie-break: each context renders its own card, and the partial
   unique indexes already forbid two services on one date *within* a plan. Kept as a
   record that the competition question was asked and answered by removing it rather than
   by resolving it — if a single-slot model is ever revisited, church-first was the call.
2. **Grace-window displacement.** With nothing upcoming, "Last Wednesday · Youth" outranks
   "Last Sunday" simply because Wednesday is later. Correct by the rule, occasionally
   surprising on a quiet week. The important case is safe: on Monday, last Sunday is one
   day old and wins.
3. **DECIDED — congregants can be granted leadership of one space** (§1 amendment, P5).
   The residual risks, recorded so they are chosen rather than discovered:
   - **It changes the publishing trust model, not just planning.** A granted leader can
     publish to a channel the whole congregation follows. Mitigated by putting the grant
     behind `manage_staff` and making revocation first-class, but a church that hands out
     grants casually has widened who speaks in its name.
   - **Sync reaping is a data-loss landmine** until the `grantSource` guard exists — which
     is why §2.2b lands it in P2, a phase early.
   - **`leader` now means two things** (staff projection vs explicit grant), distinguished
     only by a column. That is the accepted cost of keeping staff broad *and* volunteers
     narrow; the alternative (scoping staff down too) was considered and rejected.
   - P2 still ships church-wide-gate-only and must say so in its UI — the OR arrives in P5.
4. **DISSOLVED by the card-stack decision.** The worry was that following Youth for its
   posts would let Youth's Wednesday *take* the single card from your church's service.
   With a card per context nothing is taken: a parent following Youth sees a Youth card
   below their church card, which is informational rather than a false claim about where
   they will be. No opt-in, no mute, no source-restriction rule is needed.

   **Related decision (Derek, Aug 2026): connect uses opted tracks, not auto-follow-all.**
   `CHURCH_CONNECTION_SYSTEM.md` lists this as open before shipping connect; it is now
   answered. A congregant chooses which ministries they are part of, so every context card
   traces to a deliberate act. Record it in that doc when connect is built. Had
   auto-follow-all won instead, every congregant would carry a card for every ministry with
   a plan, and the context-card window in §5 would be doing far more work.

   The residual, much smaller: a congregant in many gathering ministries gets a taller
   Home. Bounded by the coming-week rule and by plans being opt-in for staff. If it ever
   bites, a per-context dismiss is the cheap answer.
5. **Both space kinds, or channels only, in P2?** Schema and gates support both. Consider
   gating the P2 *UI* to channels first — a small shared space may find a "plan" to be
   noise, and widening later is free while narrowing is not.
6. **Two "when" vocabularies on `Spaces`.** `publishCadence` beside `meetingDay`/
   `meetingTime` invites confusion. Comments mitigate; a future convergence may be
   warranted.
7. **The timezone column is thin in v1.** Stored per the locked decision, used only for
   labelling. A reviewer will ask what reads it; the answer is that it makes `'HH:MM'`
   unambiguous, and nothing else, on purpose.
8. **One timezone per church.** Multi-campus churches spanning zones are out of scope.
9. **Payload growth** is bounded (8 × the viewer's org-space count, naturally small). A
   per-viewer source cap of ~6 spaces is a cheap belt if it ever matters.

---

## 9. Series as a row (`ChurchSeries`)

Design decided Aug 2026, ahead of building. Deferred in three docs
(`CHURCH_STUDY_MATERIAL_LINKING.md` "what it needs", `MY_CHURCH_SIDEBAR.md:62`,
`PASTOR_FEATURES_ROADMAP.md` item 10's neighbours); this is the decision they were waiting
for.

### The problem with the string

`ChurchServices.seriesTitle` is free text grouped by equality. That was the right call when
a series was only a label under a sermon title, and it is why the editor grew a series
*autocomplete* — the list exists to stop a pastor typing "Life In the Spirit" in week 4 and
splitting the series in two. An autocomplete is a workaround for the absence of an entity.

Everything a church wants next needs the entity, not the label:

- **Attach material to a series** (P4's stated "grain: both") — nothing can point at a
  string that lives in eight rows.
- **A series page** — "show me this whole study" is a query for rows sharing an id, not a
  `LIKE`.
- **Re-run last series** — copying a series means copying an object with a known extent.
- **Rename** — today renaming week 5 silently forks the series; a church that renames
  mid-run gets two series and no warning.

### Shape

```
ChurchSeries
  id          text pk
  churchId    text not null
  spaceId     text            -- NULL = the church plan. Mirrors ChurchServices exactly.
  title       text not null
  createdBy / createdAt / updatedAt
  unique (churchId, spaceId, lower(title))   -- two partial indexes, per §2.1's pattern
```

`ChurchServices.seriesId` replaces `seriesTitle`. **Clean break, not both** — the same
discipline as the Shared Spaces schema. Keeping a denormalized copy would reintroduce the
bug the row exists to fix: two sources of truth, and a rename that lands in one of them.
Reads join; the join is one row per sermon on payloads that are already bounded to a
handful of weeks.

**Scope is the plan, not the church.** A series belongs to exactly the plan its sermons
belong to, and a write that points a church sermon at a space's series (or the reverse) is
rejected at the route — otherwise a granted volunteer leader could rename a row the main
service's plan renders, which is precisely the authority §4 spent its effort bounding.
Cross-plan reuse is a *copy* (new row, same title, new scope), which is what "re-run last
series" already is.

### Migration

Derive one row per distinct trimmed `seriesTitle` per `(churchId, spaceId)`, in
`deriveSeriesTitles`' existing recency order so ids read chronologically; point each
sermon at its row; drop the column. Case collisions collapse to the most recent spelling —
which is the fork this feature exists to prevent, resolved in the church's favour rather
than preserved.

### Gates

Series CRUD follows the gate of the plan it belongs to, with no new gate of its own:
`assertCanManageTeachingPlan` for `spaceId IS NULL`, `assertCanManageSpaceTeachingPlan`
otherwise. Both are already single choke points (§4), so this is a call, not a copy.

**Deleting a series never deletes sermons** — it nulls their `seriesId`. A destructive act
on a label must not be a destructive act on the calendar.

### Bulk quarter entry (rides after, UI-only)

"Repeat weekly × N" in the sermon editor, creating N rows under one series on successive
meeting dates. The date engine differs by scope and the difference is the whole risk:

- **Space plan:** dates step by 7 from the seed date; `ChurchServices_space_date_unique`
  is the backstop.
- **Church plan:** every generated row claims **the same slots as the seed row**, and the
  claim can collide with a sermon that already exists on that date. Generation therefore
  **stops at the first collision and reports the date**, rather than skipping it silently —
  a plan with a hole the pastor did not notice is worse than a short one they can see.

**Corrected while building: generated rows carry the series name, not a blank.**
`ChurchServices.title` is NOT NULL, so blank was never available. The series name is the
honest substitute — it reads correctly in the plan list ("Sep 30 · Who You Are"), says
nothing that could become false, and is the first thing a pastor overwrites. A numbered
"Week 3" is still rejected for the original reason. Passages are *not* copied from the
seed: next week is a different text, and pre-filling it would put words in the pastor's
mouth.

### As built (Aug 2026)

`POST /api/church/services/repeat` and `POST /api/church/spaces/:spaceId/services/repeat`,
both on their plan's existing gate. **Server-side rather than a loop in the editor**, and
not for tidiness: writes are rate-limited to 20 a minute and a quarter is thirteen of them,
so a client loop would spend most of a pastor's budget on one action. Date arithmetic is
`weeklyDatesAfter` in `church-sermon-repeat.ts` — UTC, because `serviceDate` is a wall
calendar day and stepping a local `Date` across a DST boundary turns "every Sunday" into a
Saturday.

**A pre-existing bug this surfaced.** The repeat run stopped on a Sunday the plan showed as
empty. Deleting a sermon dropped only its `ChurchServices` row: the ids in
`ChurchServiceTimeAssignments` are plain text columns with no foreign key, so nothing
cascaded, and the orphaned rows kept their place in
`ChurchServiceTimeAssignments_slot_date_unique` — blocking that service time on that date
permanently, with nothing in the plan to explain why. Fixed with
`clearServiceTimeAssignments` inside the delete's transaction, guarded by a contract test,
and the existing orphans were released.

---

## 10. Aggregate engagement, and the count that was not built

Roadmap item 12, built Aug 2026. Recorded here because the interesting part is a
boundary, and boundaries belong with the other decisions rather than in a changelog.

### What it is

`GET /api/church/engagement`, gated on `manage_staff`, never sponsorship-gated. Two
numbers and a list of numbers: connected congregants, and followers per ministry channel.
The hub row says `How many, never who` before anyone opens it, and the pane ends by
stating the limit outright — a pastor reading "42 connected" will wonder what else Harvous
knows, and the honest answer is the reassuring one.

Only `role = 'member'` counts as following. Staff are projected into every org space as
`owner`/`leader` by the roster sync, so counting them would let a church inflate its own
adoption by hiring, and would tell a pastor they follow their own channel.

The follower counts disclose strictly less than the church already sees: staff can open any
channel's people sheet and read the followers by name. This is that list's length without
the list.

### What it is not, and why

**There is no count of sermon-started notes**, and adding one is a decision rather than an
increment.

The roadmap sanctions two numbers — how many are connected, how many follow the study — and
a note count is neither. It would also be the first church-facing read of
`Notes.startedFromServiceId`, the congregant's own lineage column, whose single reader is
`resolveViewerServiceNotes` scoped to the viewer's own row. A contract test has forbidden
any other reader since the teaching calendar shipped, and this build **strengthened** it:
the suite now greps the whole server for the column and fails on any file outside a short
allowlist, with comment text stripped so naming the boundary in prose stays legal.

The argument for adding it is real — a pastor genuinely wants to know whether a series
landed. The arguments against, recorded so the decision can be made rather than drifted
into:

- In a church of eight connected people, "three took notes on Sunday" is close to
  individual, and week-over-week diffs are closer still.
- It changes what the product promises. "Review is never shared" currently means Harvous
  *cannot* answer that question, not that it declines to. Those are different promises, and
  only one of them survives a subpoena or an acquisition.
- Once the number exists, the pressure is to break it down — by channel, by campus, by
  week — and every breakdown shrinks the cohort.

If it is ever wanted, the shape that survives the above is a k-anonymity floor (suppress
below ~10) on a church-wide weekly total with no per-service breakdown, and it belongs in
`church-engagement.ts` behind the same gate — never in a plan route, whose contract tests
correctly forbid aggregation entirely.
