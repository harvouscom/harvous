# Child notebooks: launch status and runbook

Where the launch of parent-managed child notebooks stands, and the exact steps that finish it.
How the feature works is in [`CHILD_ACCOUNTS.md`](CHILD_ACCOUNTS.md). The COPPA work is in
[`privacy/`](privacy/): the review, the security program and the publication checklist.

**Status on 12 November 2026:** in production with enrollment closed, shown as **Coming soon**,
waiting on Epic's review of KWS Production (up to seven business days).

## Done

**Product**
- The feature is merged and deployed to production with enrollment closed (#320 and follow-ups
  through #337).
- "Coming soon" is live in two places:
  - harvous.com/add-ons/family/child-notebooks/ for everyone.
  - My Family, for Plus members only (#337).
- When the server reports enrollment open, the My Family row becomes the setup flow; nothing else
  changes.
- Production database: the family schema is applied, including stickers, highlights and consent
  history (`add-child-account-schema.ts --apply --production`, run 12 Nov 2026).
- Staging (family-test / kids-test) runs main and is how changes are checked before production.

**Privacy and COPPA**
- The children's privacy policy is live at https://harvous.com/privacy/children/.
- The policy matches the in-app notice, version `2026-11-12.3`.
- Three independent review passes stood in for counsel. Every confirmed gap was fixed
  ([`privacy/COPPA_REVIEW_2026-11.md`](privacy/COPPA_REVIEW_2026-11.md)).
- The security program was adopted 12 Nov 2026
  ([`privacy/CHILD_INFORMATION_SECURITY_PROGRAM.md`](privacy/CHILD_INFORMATION_SECURITY_PROGRAM.md)).
  Production carries `HARVOUS_CHILD_SECURITY_PROGRAM_ADOPTED=true`.
- Private records live in iCloud Drive › Harvous Compliance: staff access log, incident log and
  provider agreements. They never go in the repo.
- Provider DPAs:
  - Supabase, Cloudflare, Clerk and KWS: incorporated in their terms.
  - PostHog: signed.
  - Fly.io: requested from compliance@fly.io. Countersign it when it arrives and save it in the
    records folder.
- Cloudflare Web Analytics is in manual-snippet mode, so nothing is injected on the child or app
  hosts. Never switch it back to automatic.

**KWS (Epic Kids Web Services)**

| Setting | Test | Production |
|---|---|---|
| Branding | "Harvous Staging" | "Harvous". Privacy is `harvous.com/privacy/children/`, support is `harvous.com/support/`, plus the banner and accent `#3869E6`. Submitted for review |
| Verification methods | Credit card, Debit card | SSN, Credit card, Debit card, ID Scan, Cell Phone Certification. Submitted |
| Webhook | `harvous-family-staging.fly.dev/api/webhooks/kws` | `harvous.fly.dev/api/webhooks/kws` |
| Redirect | `family-test.harvous.com/settings/child-accounts` | `app.harvous.com/settings/child-accounts` |

Why the Production methods are what they are:
- KWS won't accept a Production product that is card-only. It requires coverage in every country,
  and cards don't cover Belarus, Cuba, Iran, North Korea, Russia, Syria or Ukraine. It appears to
  want two methods per country.
- The set above is the smallest one that enabled Submit.
- Harvous always sends `location: US`, so a parent is offered card or SSN, both COPPA-listed
  methods (§312.5(b)(2)(ii), (v)). ID Scan and Cell Phone are not offered in the US.
- AgeGraph pre-verification only counts for methods enabled on the product, which is why the set
  is kept small.

Why the webhook goes to `harvous.fly.dev` and not `app.harvous.com`: Cloudflare's bot challenge
already blocks automated clients there (GitHub's runners get a 403). Calling Fly directly keeps
Epic's calls out of it, the same as staging.

## When Epic approves

In order. The person each step needs is in brackets.

1. **Copy the KWS Production credentials into Fly** (Derek: these are secrets). Set them on the
   `harvous` app with `fly secrets set … -a harvous --stage`, staged so they go live together:
   - `KWS_ENVIRONMENT=production`
   - `KWS_ORG_ID`, `KWS_PRODUCT_ID` and `KWS_CLIENT_ID`, from Parent Verification › Integration
     information (Production)
   - `KWS_API_KEY`, the client secret
   - `KWS_SEND_EMAIL_URL`, the full product-specific send-email URL from the authenticated API
     reference
   - `KWS_WEBHOOK_SECRET`, from Parent Verification › Configuration (Production). It appears only
     after submission.
2. **Production URLs and retention**, also staged on `harvous`:
   - `HARVOUS_CHILD_APP_URL=https://kids.harvous.com/kids.html`
   - `HARVOUS_PARENT_APP_URL=https://app.harvous.com`
   - `HARVOUS_CHILD_PRIVACY_URL=https://harvous.com/privacy/children/`
   - `FAMILY_RETENTION_CRON_SECRET`: at least 32 random characters. The same value goes on the kids
     Worker in step 3.
   - Add `https://kids.harvous.com` to `ALLOWED_ORIGINS`, keeping the existing origins.
   - Leave `HARVOUS_CHILD_ACCOUNTS_ENABLED` and `HARVOUS_CHILD_RETENTION_READY` unset for now.
3. **The production child site** (Claude):
   - `npm run build:child`.
   - `npx wrangler secret put FAMILY_RETENTION_CRON_SECRET -c wrangler.kids.jsonc`.
   - Attach `kids.harvous.com` as the Worker's custom domain, then
     `npx wrangler deploy -c wrangler.kids.jsonc`.
   - Then deploy `harvous` so the staged secrets apply.
   - Confirm the page serves, that the `/api/child-accounts/child/` proxy reaches Fly with query
     strings intact, and that no analytics script is on it.
4. **Retention** (Claude): trigger or wait for the daily cron (04:17 UTC) and confirm it succeeds
   against production. Then set `HARVOUS_CHILD_RETENTION_READY=true`.
5. **Rehearsal** (Derek and Claude):
   - Set `HARVOUS_CHILD_PILOT_PARENT_ID` to Derek's **production** Clerk user id. Dev and prod
     Clerk ids differ.
   - With enrollment still off, run the real flow in production:
     1. Plus check.
     2. KWS verification by card, with the webhook arriving signed.
     3. Notice and consent.
     4. Child link, then the notebook on kids.harvous.com.
     5. A note, a highlight, Look back, export, withdraw, delete.
   - Confirm a different parent can't enroll.
   - Delete the test data, then remove `HARVOUS_CHILD_PILOT_PARENT_ID`.
6. **Open enrollment** (Derek's go): set `HARVOUS_CHILD_ACCOUNTS_ENABLED=true` and deploy.
   - My Family's "Coming soon" row becomes setup by itself.
   - On harvous.com, take the "Coming soon" labels off the child notebooks page and point its call
     to action at My Family.
   - Release notes go with it (`/marketing-agent`).

## After launch

- **Delete the staging setup** once it's no longer needed for testing. Ask before each deletion;
  none of it can be undone:
  - the staging Supabase project (`wglzcxyk…`, fictional notebooks only);
  - Fly app `harvous-family-staging`;
  - Workers `harvous-family-parent-staging` and `harvous-kids-staging`, with their family-test and
    kids-test domains;
  - the Clerk application "Harvous Child Staging" (`many-collie-1580`, the staging parent
    sign-in);
  - the KWS Test webhook that points at the staging API.
- **Yearly:** review the security program, including a fresh risk assessment and the two-factor
  check, and record it in its table.
- **Any change to what's collected or shared:**
  1. Bump `CHILD_NOTICE_VERSION`, which pauses notebooks until parents renew.
  2. Update the public policy to match, in the same release.
  3. Email parents (§312.4(b)). That email isn't built yet.

## Open items that don't block launch

- **Ask Epic** whether KWS's card check refuses prepaid and gift cards.
- **COPPA Safe Harbor (optional):** kidSAFE is the best fit, but takes 3–6 months and its price
  isn't published.
- **Two-factor hardening:**
  - turn on Cloudflare's own two-factor;
  - add two-step verification in Clerk (it can text sign-in codes);
  - add an authenticator app on Epic.
- **The child-return hop** lands on adult sign-in, which links to sign-up. Consider a sign-in-only
  page for `child_return`.
