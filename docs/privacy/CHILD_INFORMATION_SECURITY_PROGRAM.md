# Children's information security program

**Operator:** Testament Made LLC (Harvous).
**Covers:** personal information collected from children through parent-managed child notebooks.
**Required by:** 16 CFR 312.8(b), as amended in 2025.

**Status:** Ready to adopt. It's in force once the coordinator signs the table at the end, and
production enrollment stays closed until `HARVOUS_CHILD_SECURITY_PROGRAM_ADOPTED=true` is set after
that. Context and sources are in [`COPPA_REVIEW_2026-11.md`](COPPA_REVIEW_2026-11.md).

The rule asks for safeguards suited to the sensitivity of the information and to the operator's
size, complexity and activities. Harvous is a one-person company running a small, private notes
service. This program is written to be followed, not filed away.

## 1. Coordinator (§312.8(b)(1))

Derek J., owner of Testament Made LLC, coordinates this program and is the contact for security
incidents involving children's information. If anyone else gains access to production systems,
they're added in section 3 before their access starts.

## 2. What's protected and where it lives

**Children's information:**
- the child's first name or nickname;
- notes, folders, tags, Threads and references;
- Family Bible thoughts, My Bible highlights and stickers;
- Look back progress;
- notebook preferences;
- the parent's consent records;
- session and sign-in tokens;
- IP addresses in hosting and security logs.

**Where it lives:**

| System | What it holds | Who can reach it |
|---|---|---|
| Supabase (Postgres + backups) | All notebook data | Owner account; the API's server-only connection |
| Fly.io (`harvous` API) | Processes requests; holds secrets | Owner account |
| Cloudflare (Workers, CDN) | Serves the child and parent sites; edge logs | Owner account |
| Clerk | The parent's sign-in only | Owner account |
| Epic KWS | The parent's email for verification | Owner account |
| GitHub | Code and CI. No children's data | Owner account |

## 3. Access

- **Accounts.** Only the coordinator holds production accounts for the systems in section 2.
  Each uses a unique password and two-factor authentication. Status, checked 12 November 2026:
  - **GitHub:** on (authenticator app). GitHub is also the sign-in for Supabase and Cloudflare, so it
    is the key account.
  - **Supabase:** on (passkey, with recovery codes).
  - **Cloudflare:** its own two-factor is off; sign-in goes through GitHub. Turn Cloudflare's on as
    well, in case a password sign-in exists.
  - **Fly.io:** no password at all; sign-in only through the linked identity (derekj@hey.com, the
    GitHub account's email), so it's protected by that sign-in's two-factor.
  - **Clerk, Epic:** to confirm in each account's security settings.
- **No direct reads.** Staff don't open a child's notebook or query children's rows except to fix
  a problem the parent reports, with the parent's permission, or when the law requires it. Each
  such access is noted in the staff access log: iCloud Drive › Harvous Compliance ›
  `Staff access log.md`.
- **Secrets.** KWS keys, the webhook secret and the retention secret live only in Fly and
  Cloudflare secrets. They're never in code, chat or logs. A secret is rotated if it may have been
  exposed.
- **Local development.** It never uses production children's data. Testing uses the separate
  staging project with fictional children.

## 4. Safeguards already in the product (§312.8(b)(3))

- **Its own origin.** The child site is separate from adult Harvous. Its Worker blocks adult
  routes, strips cookies, sends restrictive security headers and registers no service worker.
- **Server-only data access.** Row-level security is on for every family table, and the browser
  never talks to the database.
- **Sign-in.** Links are single-use and expire after 5 minutes. Sessions end after 8 hours, and
  the parent can end them early. Session and link secrets are stored hashed.
- **Verification webhook.** Signed with HMAC-SHA256, checked within a five-minute window and
  against the expected organization, product and environment. Browser redirects never count as
  proof.
- **No content in logs.** Family routes don't log webhook bodies, email addresses, note text or
  credentials.
- **No tracking.** No session recording, autocapture or optional analytics on child pages.
  Cloudflare Web Analytics is in manual-snippet mode, so nothing is injected on the child hosts.
  It must never be switched back to automatic injection.
- **Deletion.**
  - Withdrawal deletes after 30 days.
  - An unused notebook is deleted after one year, by a daily scheduled job.
  - Deleting a notebook removes everything in it in one transaction.

## 5. Risk assessment (§312.8(b)(2)), at least once a year

Each year, and after any significant change (a new provider, new data collected, a new feature
that sends children's information), the coordinator writes down:

1. **The current risks.** Starting list:
   - a compromised owner account;
   - a leaked secret;
   - a bug exposing one family's notebook to another;
   - analytics or logging capturing children's data;
   - a provider breach;
   - backups outliving deletion;
   - a person falsely claiming to be a guardian.
2. Whether each safeguard in sections 3–4 still controls it.
3. Any new safeguard needed, with a date.

The first assessment is due before production enrollment opens.

## 6. Testing and monitoring (§312.8(b)(4))

- **Every change.** The automated family test suite (`npm run test:family`) runs in CI. It covers
  isolation between two families, session expiry, webhook signatures and deletion.
- **Before launch, then every year.** Repeat the staging checks listed in `docs/CHILD_ACCOUNTS.md`
  (deployment step 6), including the requests the child site sends to anyone other than Harvous.
- **Each month.** Confirm the retention job ran, and that no analytics script is present on the
  child site.

## 7. Incidents

If children's information may have been exposed:
1. Contain it: revoke sessions, rotate secrets, take the route offline if needed.
2. Record what happened in the incident log: iCloud Drive › Harvous Compliance › `Incident log.md`.
3. Notify affected parents without unreasonable delay. Get legal advice on any notice required by
   law.

## 8. Providers (§312.8(c))

No provider may receive children's information until Harvous has checked that it can protect it
and holds its written assurance, normally a data processing agreement. Current list and status:
see "§312.8: security program and provider assurances" in the review. Copies and an index are kept
in iCloud Drive › Harvous Compliance › Provider agreements. Status on 12 November 2026:
- **Supabase, Cloudflare, Clerk and KWS:** DPAs incorporated in their terms, so they're in force.
- **PostHog:** DPA signed.
- **Fly.io:** DPA requested from compliance@fly.io; countersign it when it arrives.

## 9. Annual review (§312.8(b)(5))

At least once a year, the coordinator updates this program for:
- the risk assessment;
- test results;
- incidents;
- new tools;
- any change in how children's information is handled.

Each review is recorded below.

| Date | Change | Coordinator |
|---|---|---|
| | Program adopted | |
