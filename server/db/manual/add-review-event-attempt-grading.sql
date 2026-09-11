-- Adds `attemptNumber` and `graded` to ReviewEvents: how an answer was reached, not just what
-- it was.
--
-- Both values already existed at the moment the outcome was recorded and were discarded. The
-- outcome route bounds `attemptNumber` (`maxAttemptsFor` decides how many goes a rung allows,
-- and the count is what picks `recalled` over `almost`), and it knows whether the rung was
-- marked against an answer key, because only a graded rung produces a grading result at all.
--
-- Without them the log cannot answer two ordinary questions:
--
--   * `revealed` conflates "wrong twice" with "gave up on the first go". Those are opposite
--     signals about a question — one is too hard, the other was never attempted.
--   * A marked rung's score and a self-judged rung's verdict average into one recall rate, which
--     compares a test result with an opinion.
--
-- Nullable rather than defaulted, and the distinction matters: a row written before this column
-- genuinely does not know which go it was, and `1`/`false` would assert that it does. Read
-- `graded IS NULL` as "unknown", never as "self-judged".
--
-- No index. Neither column is a filter on its own — they qualify rows already found by
-- (userId, action, createdAt) or by rungKey, which the existing indexes serve.
--
-- RLS: `npm run db:rls` enables it on every public table, so run that after this.

ALTER TABLE "ReviewEvents" ADD COLUMN IF NOT EXISTS "attemptNumber" integer;

ALTER TABLE "ReviewEvents" ADD COLUMN IF NOT EXISTS "graded" boolean;
