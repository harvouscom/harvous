# Shared Spaces — post-v1 roadmap

**Status:** Product sequence after the July 2026 v1 foundation. This document records intent, not shipped
behavior. Current behavior is in [SHARED_SPACES_DEV_NOTES.md](../SHARED_SPACES_DEV_NOTES.md).

## v1 baseline

The launch baseline is canonical My Home notes with reusable space associations, per-space organization,
note-level responses and Activity, owner-led Threads, safe membership lifecycle, recoverable deletion, link
invites, and owner-paid/free-to-join entitlement.

## v1.1 — richer asynchronous conversation

1. **Content mentions** for notes, folders, and Threads.
2. **Person mentions** sourced only from active space membership.
3. **One-heart acknowledgment** on a response: one lightweight heart state, not a reaction catalog.
4. **No notifications in v1.1.** Mentions and hearts improve in-context conversation first; email, push, and
   notification-center work remain deferred.

Mention behavior must follow [MENTION_PILLS.md](./MENTION_PILLS.md). Targets resolve within the visible space
context. When content is copied and the destination audience cannot access a mentioned target, the copied mention
must degrade to plain text rather than leak or imply access.

## v1.2 — freshness before live presence

1. Enable and production-verify Supabase Realtime invalidation so another member's writes refresh relevant
   queries without waiting for polling.
2. Add presence only after invalidation is reliable and observable.
3. Add event-level unread state after presence, while keeping it distinct from the existing new-note
   `lastVisitedAt` watermark.

Presence and unread indicators must not redefine Note Activity. Note Activity remains the per-note response index;
space freshness remains a separate space-level concern.

## v2 — leadership, distribution, and commerce

- Activate the `leader` role and leader-management UI.
- Complete and verify billing operations, including plans, webhook subscriptions, purchase/cancel paths, and
  support procedures.
- Add email invitations.
- Add ownership transfer with explicit billing-anchor rules.
- Ship public broadcast spaces: owner/leader publishing, follower reading, and attributed copy-out.
- Add church organization hosting, curriculum distribution, and organization administration.

## Long term — parity and evidence-led collaboration

- Bring native clients to full canonical-note, association, Thread, response, Activity, lifecycle, and offline
  parity through the shared API.
- Improve platform-specific interaction parity without forcing identical chrome.
- Consider same-note collaborative editing only if observed group behavior shows a sustained need that async
  authored notes, responses, mentions, and presence do not meet. If warranted, require a deliberate conflict,
  offline, permission, and history design before choosing CRDT infrastructure.

The long-term product remains a room where each person brings authored notes, not a default Google Docs-style
editor.
