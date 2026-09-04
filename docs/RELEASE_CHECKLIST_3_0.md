# Harvous 3.0 — Release Checklist

**Owner:** Derek. The database steps that have to run **before** `price/3-0-sevens`
(or whatever carries `new` into `main`) is deployed.

Nothing here is urgent while the branch is unmerged. Nothing here is optional
once it is.

**Status: the steps below have been run (2026-09-04).** Only step 1 changed
anything; the four tables already existed. Kept as the record of what a database
needs, and because a fresh or restored one will need all of it. See "Verifying".

---

## Why this doc exists

This repo has no migration runner. The schema is source of truth and
`npm run db:push` reconciles it, with hand-written additive SQL in
[server/db/manual/](../server/db/manual/) for anyone who cannot or should not
push. That works right up until a schema change lands with neither — which is
what happened here, five times.

The symptom is specific and worth recognising: the API returns 500 and the log
names a column, e.g. `column "foundingClaimedAt" does not exist`. Drizzle
selects explicit column lists, so a schema that names something the database
lacks fails every query against that table rather than degrading.

**On `main` today none of this is reachable**, because `main`'s schema does not
name any of it. Production is fine. The breakage appears the moment branch code
meets the production database — which is what a deploy is, and also what local
development already is, since `.env` points at the live project.

## Do not run `db:push` for this

`server/scripts/db-push-guarded.ts` says it plainly: push diffs the *whole*
schema and offers to drop whatever it does not find in `server/db/schema.ts`.
This branch is ~287 commits from `main`. Anything production has that this
branch has not caught up to is a drop candidate, against live user data.

The guard requires `--production` and will name the target
(`PRODUCTION (project mhriprqpyvhjgdssjlfl)`) before it proceeds. If that
appears, stop unless dropping is genuinely what you want.

Every file below is additive and uses `IF NOT EXISTS`. None can drop anything.

## The steps

Run in this order. Each is safe to re-run and safe to run **early** — a nullable
column and an unreferenced table are invisible to the code currently deployed,
so there is no window where production is half-migrated.

| # | What | File |
|---|------|------|
| 1 | `UserMetadata.foundingClaimedAt` | [add-founding-claimed-at.sql](../server/db/manual/add-founding-claimed-at.sql) |
| 2 | `ReviewItems` | [create-review-items.sql](../server/db/manual/create-review-items.sql) |
| 3 | `ReviewEvents` | [create-review-events.sql](../server/db/manual/create-review-events.sql) |
| 4 | `Challenges` | [create-challenges.sql](../server/db/manual/create-challenges.sql) |
| 5 | `UserNodeStates` | [create-user-node-states.sql](../server/db/manual/create-user-node-states.sql) |

`SearchEvents` also arrived on this branch but already had
[create-search-events.sql](../server/db/manual/create-search-events.sql), so it
is not repeated here — still confirm it exists in the target.

Either run each file:

```bash
npx tsx scripts/run-sql-file.ts server/db/manual/add-founding-claimed-at.sql
```

…or paste them into the Supabase SQL editor, where the target is on screen.

### Then, once (steps 2–5 only)

```bash
npm run db:rls
```

Enables row-level security on every public table. Columns do not need it;
the four new tables do, and they are unprotected until it runs.

## Verifying

**Run 2026-09-04.** Step 1 applied the column. Steps 2–5 were no-ops — all four
tables already existed, every statement answering `already exists, skipping` —
and `npm run db:rls` reported all 81 public tables already had it on.

The four table files now describe **78 columns and 15 indexes**, and were checked
by *executing* them: each `CREATE TABLE` was run into a session-scoped `TEMP`
table and the result diffed against the live table — name, type, nullability and
default, all matching, on all four.

Worth doing it that way. `CREATE TABLE IF NOT EXISTS` skips the whole statement
when the table is there, so running these files against a database that already
has the tables exercises none of the columns they declare and reports success
either way. That is why the gap below survived: the files had been *run*, and
running them proved nothing.

The earlier count of 73 was checked against `schema.ts` and was already wrong by
the time it was written. `ReviewItems` was missing `intervalDays`, `lapseCount`
and `lastRungKey`; `ReviewEvents` was missing `previousIntervalDays` and
`nextIntervalDays`. The live tables had all five, because they arrived by push;
only the hand-written files did not. Run against a fresh or restored database,
`create-review-items.sql` would have built a table without `intervalDays` and
every ReviewItems query would have 500'd — the exact failure this document was
written to prevent, reintroduced by the fix for it.

Two of those five are declared only on the review-engine branch. The files carry
the union deliberately, and say why in their headers: an unnamed column is never
selected and costs nothing, a missing one fails every query against the table.

The lesson is narrower than "check the files". It is that `schema.ts` is only the
source of truth for the branch you are reading, while the database is shared —
so **check a manual file against the database, not against the schema**.

Afterwards, the honest check is the endpoint that fails first:

```bash
curl -s -o /dev/null -w '%{http_code}\n' <origin>/api/user/get-profile
```

401 signed-out is fine — 500 is the column still missing. In the app, Home's
Continue / Following / Suggested sections returning is the visible signal, since
they are the ones that go blank when the profile fetch fails.

## Afterwards

Fold this into whatever the schema convention becomes. The rule worth keeping is
the one this branch broke: **a change to `server/db/schema.ts` lands with its
`server/db/manual/*.sql` in the same commit.** The push-only path is fine for a
database you own outright and wrong for one shared with production, which is the
situation here.
