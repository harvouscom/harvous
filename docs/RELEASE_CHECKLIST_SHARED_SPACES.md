# Shared Spaces — Release Checklist

**Owner:** Derek. This is the condensed operational runbook for shipping
Shared Spaces to production. Full detail:
[SHARED_SPACES_LAUNCH_STRATEGY.md](future/SHARED_SPACES_LAUNCH_STRATEGY.md)
(billing + verification gates) and
[SHARED_SPACES_TESTING.md](SHARED_SPACES_TESTING.md) (migration runbook).

There is **no runtime feature flag** — the paid add-on entitlement
(`canCreateSharedSpace` + `CLERK_SHARED_SPACES_PLAN_ID`) is the only gate.
Once merged and the Clerk plan is configured, real users can purchase and
create. Steps 2–3 are truly blocking.

Church-org groundwork on this branch is inert and does not affect any step
below (admin-gated pipes only; no user-facing surface). The `Churches` table
ships automatically in step 5's `shared-spaces:db:push` — no extra migration
step.

## 0. Pre-merge code state

- [ ] All in-flight work committed (note templates, church-org slice)
- [ ] Merge current `main` into `feat/shared-spaces-foundation`
      (~10 commits: publish pack, OG-image work, appearance fixes; keep the
      branch's higher version number)
- [ ] `npm run test:shared-spaces:offline` green
- [ ] `npx tsc --noEmit` matches the known baseline (207 pre-existing errors)
- [ ] `git diff --check` clean

## 1. Clerk billing configuration (dashboard)

- [ ] Create Shared Spaces monthly + annual plans in Clerk
- [ ] Set production env: `CLERK_SHARED_SPACES_PLAN_ID`,
      `VITE_CLERK_SHARED_SPACES_PLAN_ID`, `CLERK_WEBHOOK_SECRET`
- [ ] Register subscription-item events (active / canceled / ended / expired)
      to the webhook endpoint

## 2. Billing launch gate (LAUNCH_STRATEGY lines 72–82)

- [ ] One real purchase → shared-space creation unlocks after checkout
- [ ] Cancellation → correct behavior at period end / expiration
- [ ] Joining remains free for non-payers throughout
- [ ] Write support/recovery notes for webhook delay or failure
      (`/api/billing/sync-shared-spaces` is the reconcile-on-read fallback;
      it never auto-revokes)

## 3. Protected live e2e

- [ ] Disposable Supabase project only (never production), full safety env
      (disposable marker, matching project ref, unique run ID), two distinct
      `sk_test_` Clerk users
- [ ] `npm run test:e2e:shared-spaces` (sets
      `HARVOUS_SHARED_SPACES_RELEASE_GATE=1`)

## 4. Migration — staging first, then production

Follow SHARED_SPACES_TESTING.md exactly (env block + production ack marker;
backup + quiesce writers first):

1. `shared-spaces:schema:additive` (dry) → `-- --apply`
2. `shared-spaces:preflight`
3. `shared-spaces:backfill -- --batch-size=200` (dry) → `-- --apply`
4. `shared-spaces:verify -- --batch-size=200`
5. `shared-spaces:db:push` (review dry-run) → `-- --apply`  ← also creates
   `Churches` + `NoteTemplates` and reconciles RLS
6. `shared-spaces:verify` again
7. Deploy, smoke `/` and `/n/{id}`, resume writers

Generic `npm run db:push` is NOT approved for the cutover.

## 5. Manual product smoke (post-deploy)

- [ ] `/` and `/n/{id}` load
- [ ] Compose: My Home vs This-space destination cue + opt-in thread chip
- [ ] Note Activity panel (avatar rows, space colors)
- [ ] Thread permissions (owner/leader structure vs member compose)
- [ ] Space lifecycle: soft-delete + recovery window in Settings
- [ ] Privacy: encrypted notes excluded from shared contexts; invite preview
      shows metadata only; non-owners never see member emails
- [ ] Invite create → redeem → member cap behavior

## 6. Ship

- [ ] Merge `feat/shared-spaces-foundation` → `main`, deploy
- [ ] Flip the billing-status wording in
      [SHARED_SPACES_DEV_NOTES.md](SHARED_SPACES_DEV_NOTES.md) from
      "not production-verified" once step 2 passed
- [ ] Marketing/release notes via `/marketing-agent`

## After release

Church-org work continues on its own branch cut from main: connect flow
(`ChurchConnectionRequests`), congregant auto-follow, "From your church"
surface, role-gated feature payload, church billing. See
[future/PASTOR_FEATURES_ROADMAP.md](future/PASTOR_FEATURES_ROADMAP.md) and
[future/CHURCH_ORG_AND_CURRICULUM.md](future/CHURCH_ORG_AND_CURRICULUM.md).
