# Recall usage metrics

Status: **Phase 2 implemented** (2026-06-29).

## Phase 1 (shipped)

Admin `/admin/usage` reads recall engagement from server-side data. Fingerprint coverage metrics were removed as not actionable.

## Phase 2 (shipped)

### Schema

`RecallEvents` table — append-only carousel `open` / `snooze` events with `opportunityId`, `kind`, optional `noteId`.

Run `npm run db:push` after deploy.

### API

`POST /api/recall/event` — authenticated, rate-limited. Validates kind/action against [`src/utils/recall-opportunity-kinds.ts`](../src/utils/recall-opportunity-kinds.ts).

When `action` is `open` and `noteId` is set, also calls `recordNoteRecallEngaged` for spaced-repetition stability.

### Client

[`spa/src/pages/prototype/proto-recall-events.ts`](../spa/src/pages/prototype/proto-recall-events.ts) fires events from [`PrototypeRecallCarousel.tsx`](../spa/src/pages/prototype/PrototypeRecallCarousel.tsx).

Local snooze cooldown ([`proto-recall-cooldown.ts`](../spa/src/pages/prototype/proto-recall-cooldown.ts)) remains for fast/offline resurfacing control.

### Admin metrics

Recall section on usage dashboard: opens, snoozes, snooze rate, users active, opens-by-kind bar chart, recall-opens trend line. Avg stability still from `NoteFingerprints`.

## Out of scope

- Carousel impressions (opportunities shown without interaction)
- Native iOS until it posts the same API
- Legacy featured `contentType: 'recall'` inbox cards
