-- Adds `rungKey` to ReviewEvents for databases created before question feedback.
--
-- The log records what a review item was answered with, but never which rung was asked. It did
-- not need to while every event was an outcome — `ReviewItems.lastRungKey` names the most recent
-- asking and nothing looked further back. Thumbs up / thumbs down changed that: a rating is about
-- a *question*, so the log has to say which one, and the windowed dislike tally reads it back.
--
-- The exercise family is derived from this key, never stored: `FAMILY_BY_KEY` is "a naming, not a
-- taxonomy" and is expected to be re-cut, and a denormalized family would freeze one cut into an
-- append-only log.
--
-- Nullable, so every row already written stands. The tally skips null rungs.
--
-- The paired index serves the tally, which filters userId + action inside a rolling window.
--
-- RLS: `npm run db:rls` enables it on every public table, so run that after this.

ALTER TABLE "ReviewEvents" ADD COLUMN IF NOT EXISTS "rungKey" text;

CREATE INDEX IF NOT EXISTS "ReviewEvents_userId_action_createdAtIndex" ON "ReviewEvents" ("userId", "action", "createdAt");
