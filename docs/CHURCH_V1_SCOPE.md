# Church V1: Scope and Status

**As of September 18, 2026.** This is the single place that says what the church layer does,
what V1 added, and what V1 deliberately leaves out. Where another doc disagrees, this one
reflects the code. Operational steps live in
[CHURCH_ORG_ONBOARDING_AND_BILLING.md](CHURCH_ORG_ONBOARDING_AND_BILLING.md).

## What V1 is

- **Concierge pilots.** A Harvous admin registers each church and starts its pilot by hand.
  Polar church checkout is built but stays dormant; a church that pays by invoice is marked
  paid from `/admin/churches`.
- **Web and PWA only.** Native Swift has only the free-text My Church field. No church hub,
  channels or planner in the native app.

## The loop, end to end

Admin registers church → pilot → staff roster and roles (Clerk org) → ministry channels →
congregant connects in Settings › My Church → picks ministries → follows → staff publish →
"From your church" on Home, marked new → This Sunday with the church's note template → the
congregant writes their own note, or takes a study plan into their own study or their group.

## Built before V1 (unchanged)

Church registry and admin page · pilot sponsorship (writes only; reads survive a lapse) · staff
roster, invites, role changes and sync · 8 role capabilities · ministry channels and follow ·
ministry picker (the cold-start answer; connect deliberately does not auto-follow) · church
feed · This Sunday and the seeded note · org note templates · teaching plan and the expanded
planner · `ChurchSeries` and re-runs · per-space plans and "coming up" · space plans on Home
and material attached to a Sunday (P3/P4) · room-lane study-plan publish · plan completion and
close · personal reading plans · connect picker · channel↔space pairing · granted volunteer
leadership · church and space resource library and suggestions · "What's next" suggestions,
phase 1 · aggregate engagement ("how many, never who") · Sunday and midweek reminders ·
Shared Space invites and join · public study-plan preview.

## Added in V1

| | What | Where |
|---|---|---|
| Hardening | Church billing needs `manage_billing` (admins), not just staff | `church-org-access.ts` `churchBillingRule` |
| Hardening | The staff write gate proves staff before revealing that a church lapsed | `church-staff.ts` |
| Hardening | A church Shared Space's invite links bill to the church, not the staffer | `space-invite-gate.ts` |
| Staff | Write straight into a channel you run; the draft stays private until published | `canComposeInSpace`, `PrototypeNotePage` |
| Staff | Publish a church-plan series into a channel as a study plan | `POST /api/church/series/publish-thread` |
| Staff | Curriculum handoff: copy a channel's study plan into Home or a group you lead | `POST /api/church/channels/:spaceId/threads/:threadId/copy` |
| Staff | "Get your church set up" card on the hub | `church-setup-steps.ts`, `PrototypeChurchSetupCard` |
| Staff | Import straight into a channel or group | import commit `targetSpaceId` |
| Congregant | New marks on "From your church" | `/api/church/feed` `isNew` |
| Congregant | Opt-in "New from your church" push, at most once a day | `church-publish-push.ts`, Settings › Reminders |
| Congregant | Leaving a church releases its channel follows; a church that's gone says so | `releaseChannelFollowsForOrg`, `connectedChurchInactive` |
| Everyone | Passage history: every note of yours on a passage, newest first | `GET /api/scripture/passage-notes` |
| Operate | Mark an invoice-paying church paid | `POST /api/admin/churches/:churchId/billing` |
| Operate | Reproducible DDL for the church core tables | `npm run church-core:schema` |
| Operate | End-to-end pilot loop | `e2e/church-pilot-loop.spec.ts` (needs `E2E_CHURCH_*`) |

Fixed along the way: the Reminders page never sent `cadence`, so "Every day" was saved as
twice-weekly.

## Out of V1

Self-serve church creation and Polar checkout · native church surfaces · multi-church
(`ChurchMemberships`, still no writers) and `ChurchConnectionRequests` · "What's next"
phases 2–4 (slate and vote) · seasonal recall · email invites and invite-as-leader ·
church-aware reminders tied to service times (fenced by design) · unlimited staff (Clerk
Enhanced) · ChMS sync · church offboarding (`deletedAt`/`recoveryUntil`) · a count of
sermon-started notes (a privacy decision, not a feature) · `FeaturedItems.contentType='church'`
(accepted by the API, no writer, and its card has no tap action).

## Before inviting the next pilot

- `npm run church-core:schema` against production in dry-run form, then `:apply` if anything is missing.
- Confirm the Clerk roles `org:pastor`, `org:coordinator` and `org:teacher` exist in the
  production instance. A missing role quietly degrades to publish-only.
- Check pilot windows at `/admin/churches`. New Hope Assembly of God's ran to 2026-09-02.
- Provision the `E2E_CHURCH_*` fixtures so the pilot-loop spec runs in CI.
