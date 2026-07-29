# Shared Spaces — freshness follow-ups

**Status:** Future improvements. Not required for the July 2026 freshness hardening pass
(own-note exclusion, `joinedAt` watermark, visit stamp on notes list, no active-row badge,
realtime bump removal). Current space-activity model is in
[SHARED_SPACES_DEV_NOTES.md](../SHARED_SPACES_DEV_NOTES.md). Sequencing with presence/unread
is in [SHARED_SPACES_ROADMAP.md](./SHARED_SPACES_ROADMAP.md) **v1.2**.

## 1. Solo / sparse-space social greeting copy

**Today:** [`SharedSpaceSocialGreeting.tsx`](../../spa/src/pages/prototype/SharedSpaceSocialGreeting.tsx)
and `sharedSpacePeopleHeaderLabel` (“Just you · Invite”). Solo owners often fall into:

- “You've been adding {N} notes here lately.”
- “This shared space has {N} notes.”

**Why it feels odd after own-note exclusion:** Badges correctly go quiet (no “new from others”),
but the dashboard still talks like a group room. Loading also briefly uses
`peopleCount = members.length || 1`, which can flash “Just you.”

**Possible directions:**

- Solo-owner branch: quieter empty/sparse copy (“Your space for this group — invite when ready”)
  instead of faux-community lines.
- Don’t render the greeting when `otherContributors.length === 0` and there’s no presence
  (already returns `null` when totally empty — extend that for “only me + my notes”).
- Stabilize people header: don’t fall back to `1` while members are still loading.

**Depends on:** Product tone for early solo spaces (invite-forward vs study-alone).

## 2. “New notes” vs “updated since visit”

**Today:** `countNewNotesInSpaceSince` uses `Notes.updatedAt > watermark`. Dashboard cards say
“New since your last visit.” Editing an old note bumps the count for everyone else.

**Why it matters:** Copy says “new notes”; behavior is “touched notes.” Correct for collaboration
(you may want to see edits), wrong if users expect create-only.

**Possible directions:**

- **A — Copy only:** “Updated since you were here” / “Activity since your last visit.”
- **B — Dual signal:** Count creates (`createdAt`) for badges; show a softer “edited” treatment
  for updates.
- **C — Create-only badges:** `gt(Notes.createdAt, watermark)` for nav; keep updated-based cards
  elsewhere.

**Depends on:** Whether Shared Spaces freshness is “inbox of posts” or “what changed in the room.”
Roadmap v1.2 already plans event-level unread later — don’t collapse that into this watermark
without a design pass.

## 3. Church hub vs space switcher affordance unification

**Today (after the freshness pass):**

| Surface | Inactive space with news | Active space with news |
|--------|--------------------------|-------------------------|
| Space switcher | Dot on icon | None (intentionally quiet) |
| Church hub list | Dot + numeric badge | Same row treatment |

**Why it matters:** Same underlying `newNoteCount`, different chrome — easy to misread as
different systems. Hub still does not stamp visit itself; clearing depends on entering each space
(dashboard or notes list).

**Possible directions:**

- One rule everywhere: inactive = gray count or dot; active = nothing.
- Prefer per-space visit over any “hub viewed” stamp.
- Hub empty state: “Still quiet here” vs “No channels yet” when the user simply hasn’t created any.

**Depends on:** My Church information density (count vs whisper).

## 4. Live presence (stubs → real)

**Today:** Dashboard greeting accepts `presenceOthers` but callers often pass `[]`.
`useSpacePresence` exists; roadmap says presence **after** Realtime invalidation is solid
([SHARED_SPACES_ROADMAP.md](./SHARED_SPACES_ROADMAP.md) v1.2).

**Why it matters:** Greeting already has a “{Name} is here with you” branch. Shipping half-wired
presence would confuse more than silence.

**Possible directions (roadmap order):**

1. Production-verify Realtime invalidation.
2. Wire presence into shared dashboard / Thread views with clear “here now” semantics (not unread).
3. Keep presence distinct from `lastVisitedAt` new-note counts and from Note Activity.

**Out of scope reminder:** Presence must not redefine Note Activity
([SHARED_SPACES_DEV_NOTES.md](../SHARED_SPACES_DEV_NOTES.md) — space activity vs note activity).

## 5. Smaller copy / consistency nicks (backlog)

- [`formatHomeNoteCount(1, true)`](../../src/utils/prototype-home-trends.ts) → `"1+ notes"` (awkward).
- Owner empty Threads/Folders: “added by {chip}” when the chip is yourself.
- Owned-space limit footer copy vs joined spaces (accurate but easy to misread).
- Client `isNoteUnseenSinceVisit` string compare vs server `Date` compare — align on one helper.
- Session-only unseen watermark in `sessionStorage` — new tab loses row dots until visit re-runs.

## 6. Event-level unread (post-presence)

Roadmap v1.2 item 3: per-event unread distinct from space visit watermark. That is the long-term
answer to “did I see *this* note,” not another tweak to `lastVisitedAt`. Do not start here until
presence + invalidation land.
