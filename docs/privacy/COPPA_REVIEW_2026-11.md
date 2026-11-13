# Child notebooks: COPPA review (November 2026)

A requirement-by-requirement check of parent-managed child notebooks against the FTC's COPPA
Rule as amended in 2025. It was prepared to save a lawyer's time, not to replace one. **This is
not legal advice.** Testament Made LLC should have a privacy lawyer who handles COPPA confirm the
conclusions and answer the questions at the end before real children's information is collected.

**Sources read for this review (12 November 2026):**

- The final rule as published in the Federal Register: 90 FR 16918, document 2025-05904, 22
  April 2025, from govinfo.gov. It took effect on 23 June 2025. Compliance with everything
  relevant here was required from **22 April 2026**, so the amended rule applies in full to any
  launch now.
- Iowa Code §715D.2 (2026 code).
- The FTC's COPPA FAQ, for the penalty figure only. Its body text predates the 2025 amendments,
  so nothing else was taken from it.

**What was checked against the rule:**

- The in-app parent notice: `spa/src/pages/family/ChildPrivacyNotice.tsx`, version
  `2026-11-12.1`. Open PR #327 adds Clerk and bumps it to `2026-11-12.2`.
- The draft public policy: harvouscom/harvous.com#72, at `/privacy/children/`.
- The KWS portal's verification methods.
- The parent setup screen.
- The analytics configuration.

## Summary

| Area | Rule | Status |
|---|---|---|
| Iowa law | Iowa Code 715D | **Doesn't apply** (thresholds, and a COPPA exemption) |
| Direct notice to the parent | §312.4(b)–(c) | Meets it, with one wording fix |
| Online policy and where it's linked | §312.4(d) | Meets it once #72's placeholders are filled and two additions are made |
| Verifiable parental consent | §312.5 | Meets it. US methods map to listed methods |
| Separate consent for third-party disclosure | §312.5(a)(2) | Not triggered. Say so plainly |
| Parent review and deletion | §312.6 | Meets it in the app. The off-app request process is still a placeholder |
| No over-collection | §312.7 | Meets it |
| **Written information security program** | §312.8(b) | **Missing.** Drafted alongside this review |
| **Written assurances from providers** | §312.8(c) | **Not on file** |
| **Written data retention policy** | §312.10 | Partly done. Backup and log periods now known; needs the table added to the policy |
| Analytics on the child site | the notice's own promise | **Fixed 12 Nov 2026.** Cloudflare Web Analytics switched to manual snippet; beacon gone |

## Iowa: the Consumer Data Protection Act doesn't apply

Iowa Code §715D.2(1) applies only to a business that, in a calendar year, controls or processes
personal data of at least 100,000 Iowa consumers. A business with at least 25,000 also qualifies
if it derives over half its gross revenue from selling personal data. Harvous meets neither.

Separately, §715D.2(3)(r) exempts "personal data used in accordance with" COPPA and its rules. So
for child notebooks, COPPA is the law that matters, even if Harvous grows past the thresholds.

Not checked: other states' children's privacy and age-assurance laws (age-appropriate design
codes, app-store age laws), and whether any Iowa children's-online bill passed in 2025–2026. Most
of those laws have revenue or user thresholds well above Harvous. Ask the lawyer to confirm for a
US-wide launch.

## §312.4(c): the direct notice

The in-app notice in `ChildPrivacyNotice.tsx` is shown on the parent's setup screen beside the
name field, with the policy link.

| Element | Where it's met |
|---|---|
| (c)(1)(ii) Consent is required, and nothing is collected without it | "We collect, use, and disclose notebook information only after you give permission." **Fix:** add the second half explicitly: "If you don't agree, we won't create a notebook or collect anything from your child." |
| (iii) Items collected, uses, potential disclosures | The "Eligibility and information we store" section |
| (iv) Third parties, and consent without disclosure | Providers are named. **Add:** "We don't disclose your child's information to third parties, so there is nothing separate to agree to." See §312.5(a)(2) below |
| (v) Link to the online notice | The "Privacy policy and contact details" row |
| (vi) How the parent consents | KWS verification, the guardian confirmation, then "Agree and create notebook" |
| (vii) Deleting contact information if consent never comes | Not triggered. Harvous doesn't collect the parent's contact details from the child; the parent's email comes from their own account. Unfinished verification requests still expire after seven days |

## §312.4(d): the online policy (#72) and where it's linked

**Placement.** The rule wants a prominent, clearly labelled link on the landing screen and next
to every place children's information is collected. The child site has the policy footnote on
Home, the signed-out page, the note editor, the Family Bible reply box, search and Settings. The
parent page links it right where the child's name is entered. This meets the rule.

**Contents.**

- (d)(1) Operator name, address, phone, email: met. #72 now has Testament Made LLC's Waukee
  address and phone. The service providers aren't "operators" because they handle data on Harvous's
  behalf, so naming them is good practice rather than required.
- (d)(2) What's collected, whether anything is public, uses, disclosure, and the retention policy:
  met, except the retention policy needs the items in §312.10 below.
- (d)(3) Persistent identifiers collected for internal operations: **add one sentence.** IP
  addresses and the session token are persistent identifiers. Say they're used only to deliver
  and secure the notebook, never to contact a child, build a profile or advertise.
- (d)(4) Audio: not applicable. There's no voice input. Keep it that way, or this item applies.
- (d)(5) Review, deletion and refusing further collection: met in the app. The off-app
  verification step is a placeholder (see the questions for the lawyer).

## §312.5: verifiable parental consent

**Method.** In the US, KWS offers exactly two methods. Face scan and ID scan are excluded for the
US, as the portal shows.

- **Social Security number** checked against a national database. This maps to (b)(2)(v): a
  government-issued identifier checked against databases of such information. The rule requires
  the operator to delete the identification promptly. Harvous never receives the number; KWS
  does. Confirm KWS deletes it promptly, or get it in writing.
- **Credit or debit card** with a 5¢ charge that's later refunded. This maps to (b)(2)(ii): a card
  "in connection with a transaction" that notifies the account holder of each discrete
  transaction. A real charge shows on the statement, which is the point of the method.

**Parenthood.** KWS proves the person is an adult. The parent then confirms in Harvous that they
are the child's parent or legal guardian. The rule's test is a method "reasonably calculated...
to ensure that the person providing consent is the child's parent". Pairing a listed
identity/payment method with an attestation is the common industry approach. Ask the lawyer to
confirm (question 1).

**AgeGraph.** A parent KWS has already verified skips verification and is treated as
pre-verified. That parent still sees Harvous's own notice and attestation. Ask whether an
earlier verification, made for another company, satisfies "reasonable efforts" for this consent
(question 2).

**§312.5(a)(2), separate consent for third-party disclosure.** "Third party" excludes anyone who
"provides support for the internal operations" and doesn't use the data for anything else. Fly.io,
Cloudflare, Supabase and Clerk fit, if their contracts say so (see §312.8(c)). KWS receives only
the parent's email, country and language, not the child's information. With no third-party
disclosure, there's no separate consent to collect. The notice and policy should say this in one
sentence, as above.

## §312.6: parent review

Met in the app: read, export (readable text or a full backup), end sessions, remove ministry
access, withdraw consent, delete. Two gaps:

- #72 has a placeholder for how an email, mail or phone request is verified. Proposed rule: act
  only on requests that come from the email of the parent account managing the notebook, or that
  the parent confirms by signing in. Never act on a request from anyone else.
- A process for guardianship disputes (question 4).

## §312.8: security program and provider assurances

**(b) A written information security program is required, and Harvous doesn't have one.** It must
have five parts:

1. a designated coordinator;
2. a risk assessment, at least once a year;
3. safeguards matched to those risks;
4. regular testing and monitoring;
5. a review of the program, at least once a year.

The rule scales the program to the operator's size. A one-person company can meet it with a few
pages it actually follows. A draft is in
[`CHILD_INFORMATION_SECURITY_PROGRAM.md`](CHILD_INFORMATION_SECURITY_PROGRAM.md).

**(c) Written assurances from every provider that handles children's information.** These are
needed before launch, and none are on file in this repo. Keep a copy of each:

| Provider | What to keep |
|---|---|
| Supabase | Data Processing Addendum. Note the plan's backup retention |
| Fly.io | Data Processing Agreement |
| Cloudflare | Data Processing Addendum (self-serve in the dashboard) |
| Clerk | DPA. It handles only the parent, but the parent's account is linked to the child |
| Epic (KWS) | KWS terms and DPA. Confirm how long SSN and card data are held and that they're deleted promptly |

## §312.10: written data retention policy

It must give, for each category: why it's collected, the business need to keep it, and when it's
deleted. It must also be in the online policy. Nothing may be kept indefinitely. #72 has the
timeframes. Proposed table to add to #72:

| Information | Why we collect it | Why we keep it | When it's deleted |
|---|---|---|---|
| Name or nickname, consent record, consent history | To create the notebook and show the parent agreed | Needed while the notebook exists | With the notebook. See question 3 on keeping a minimal consent record |
| Notes, readings, thoughts, highlights, stickers, preferences | The notebook itself | The child and parent come back to them | When the parent deletes them, 30 days after withdrawal, or after a year unused |
| Look back progress | To choose what to show next | Spacing depends on history | With the notebook |
| Sessions and sign-in links | To open the notebook | Only while open | Links after 5 minutes, sessions after 8 hours |
| Verification requests | To confirm the parent is an adult | Until finished | 7 days if unfinished |
| Database backups | Recovery | Disaster recovery | Daily Supabase backups, each kept 7 days. Point-in-time recovery is off. Deleted data can stay in a backup for up to about 8 days (checked 12 Nov 2026) |
| Hosting and security logs (IP addresses) | Delivery and security | Abuse investigation | Up to 7 days. Fly log search keeps 7 days, with no log shipping configured. Cloudflare Workers Logs keep at most 7 days, and are off for the child Workers but on for the app Worker serving app.harvous.com (checked 12 Nov 2026) |

## Finding: Cloudflare Web Analytics is on the child site

On 12 November 2026, the HTML served at `kids-test.harvous.com/kids.html`,
`family-test.harvous.com` and `app.harvous.com` included Cloudflare's Web Analytics beacon
(`static.cloudflareinsights.com/beacon.min.js`). It's injected at Cloudflare's edge, not by
Harvous code.

The notice promises "no ... optional analytics" for child accounts. `docs/CHILD_ACCOUNTS.md` says
"Do not enable Cloudflare Web Analytics or other tracking injection on this origin."

**Fixed, 12 November 2026.** On the free plan, Web Analytics can't exclude a single host, so the harvous.com site was switched to "Enable with JS Snippet installation". Cloudflare now injects nothing on any harvous.com host. The marketing site gets the snippet by hand, in its own PR. Within a minute the beacon was gone from kids-test, family-test (including `/settings/child-accounts`) and app.harvous.com. The original instruction was: in Cloudflare → Web Analytics → the harvous.com site: turn off automatic
injection, or add a rule excluding `kids.harvous.com` and `kids-test.harvous.com`. Also exclude
`app.harvous.com/settings/child-accounts`. That page's URL carries a child's notebook id, and the
beacon reports page URLs. Then fetch each page again and confirm the beacon is gone.

PostHog, the app's own analytics, is already set up correctly in `src/utils/posthog.ts`:
- session recording is off;
- autocapture is off;
- `before_send` drops any event from the Family or Child notebooks pages, or that mentions a child
  id.

## Exposure and the LLC

The FTC's COPPA FAQ lists civil penalties of up to **$53,088 per violation**. The FAQ doesn't
date the figure, and it's adjusted for inflation each year. Courts can count each affected child
separately.

A single-member LLC generally keeps personal assets apart from the company's debts. The FTC can
still name an individual who directs or controls the practices involved. So the protection comes
from following the rule, not from the LLC. Ask the lawyer about insurance (question 7).

## Questions for the lawyer

1. Does KWS adult verification (SSN database check, or a 5¢ card charge) plus Harvous's
   parent-or-guardian attestation meet §312.5(b)'s "reasonably calculated to ensure that the
   person providing consent is the child's parent"?
2. Is KWS AgeGraph pre-verification (verified earlier, possibly for another company) acceptable as
   "reasonable efforts" for this consent? Should Harvous require a fresh verification instead?
3. Should a minimal consent record (parent id, notice version, consent and deletion dates)
   outlive the notebook's deletion, as evidence of consent? For how long, given §312.10?
4. What should Harvous do when someone else says they are the child's guardian, or two guardians
   disagree?
5. Is the off-app request rule in §312.6 above (act only on the managing parent's account email,
   or after the parent signs in) enough?
6. Does anything beyond COPPA apply to a US-wide launch: state age-appropriate design codes,
   app-store age laws, Iowa bills from 2025–2026?
7. Is cyber or privacy liability insurance worth carrying, and does the FTC's February 2026 policy
   statement on age verification (not read for this review) change anything above?
8. Is the 2026-11-12 notice wording a "material change" from what staging parents agreed to? It
   doesn't matter in production, where no one has consented yet.

## Before launch, in order

1. ~~Fix the Cloudflare Web Analytics injection.~~ Done 12 Nov 2026.
2. Adopt the security program: fill it in, sign and date it.
3. Collect DPAs from Supabase, Fly, Cloudflare, Clerk and Epic; note backup and log retention.
4. Fill #72's placeholders, add the retention table and the (d)(3) sentence; add the "nothing
   without consent" and "no third-party disclosure" sentences to the notice (one new notice
   version).
5. Lawyer review of this document, the notice and #72.
6. Publish the policy, then submit KWS Production for Epic's review.

## Second review: three independent passes (12 November 2026)

There is no counsel. In its place, three reviewers worked separately from the rule text and the code,
not from this document:
1. The notice and policy, element by element against §312.4–§312.10.
2. Every claim the notice and policy make, checked against the code.
3. An adversarial "FTC staff" reading.

Each finding below was verified in the code before it was acted on.

**Fixed in code**, in the PR that added this section:
- **PostHog leak.** The child's "Give it to my parent" hop lands on adult sign-in with the settings path
  URL-encoded, and the analytics filter missed it. It now matches the encoded form and `child_return=`,
  with a behavioural test (`src/utils/__tests__/posthog-child-context.test.ts`).
- **Look back left rows behind.** A child's answers wrote study-graph rows (`UserNodeStates`) that notebook
  deletion never cleared. Children no longer write them, and deletion clears any that exist. The "shown"
  events are now awaited, so none can land after a delete.
- **Free text could be stored.** The child answer route no longer passes on `attempt`, so a child's Look
  back can't store free text even if a request sends it.
- **Removing access during a pause.** Removing ministry access works while a notebook is paused for
  re-consent, as the policy's "at any time" promises.
- **Enrollment gate.** Production enrollment, the pilot included, now also requires
  `HARVOUS_CHILD_SECURITY_PROGRAM_ADOPTED=true` (§312.8(b)).
- **Policy link inside the notice.** The notice now links the policy itself, so the renewal screen has the
  link (§312.4(c)(1)(v)). My Bible has the policy footnote by its highlights and stickers (§312.4(d)).
- **Notice wording** (now version `2026-11-12.3`):
  - the consent checkbox no longer says "disclosure";
  - the disclosure exceptions match the policy;
  - it names the country and language sent to KWS;
  - it tells the parent to "check the box and select Agree";
  - it makes clear that the 30-day export window follows a withdrawal.
- **Kids Worker query strings.** The Worker dropped query strings, so Look back's day boundary never reached
  the API. Not a privacy issue.

**Policy wording**, sent to the harvous.com policy PR: the notice summarizes the policy rather than
matching it; KWS is listed separately as handling only the parent's details; there's no single-note
delete; no retention row is open-ended; "last used" gets a row; expired links and sessions are cleared
daily; the completed verification (email hash and KWS reference) is kept with the notebook; the export
holds Look back's current progress; and the wording about adult Harvous is tighter.

**Still Derek's to decide or do before launch:**
1. **AgeGraph pre-verification** (all three passes flagged it). A parent KWS has already verified skips
   every listed method. Either turn pre-verification off for Harvous in KWS, if the portal allows it, or
   add a confirmation email to the verified address after consent, which §312.5(b)(2)(viii) allows
   because Harvous makes no disclosures.
2. **Epic in writing:** how long KWS keeps SSNs and card data, and whether it refuses prepaid and gift
   cards (§312.5(b)(2)(ii), (v)).
3. **The written assurances (DPAs)** and the signed security program, including the staff-access log the
   policy promises. Then set `HARVOUS_CHILD_SECURITY_PROGRAM_ADOPTED=true`.
4. **Email parents when the notice changes** (§312.4(b)). This only matters once real parents exist.
5. **The child-return hop** still lands on a sign-in page that links to sign-up. Consider a sign-in-only
   page for `child_return`.
6. **A COPPA Safe Harbor program** (kidSAFE, PRIVO, iKeepSafe and others, §312.11) is the practical stand-in
   for counsel. It gives an accountable review and deemed compliance while Harvous follows its guidelines.
