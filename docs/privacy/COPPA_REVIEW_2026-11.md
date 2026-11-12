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
| **Written data retention policy** | §312.10 | Partly done. Needs backup and log periods plus a "business need" for each item |
| **Analytics on the child site** | the notice's own promise | **Broken today.** Cloudflare Web Analytics is injected |

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
| Database backups | Recovery | Disaster recovery | **Fill in:** Supabase plan's backup window |
| Hosting and security logs (IP addresses) | Delivery and security | Abuse investigation | **Fill in:** Fly and Cloudflare log retention |

## Finding: Cloudflare Web Analytics is on the child site

On 12 November 2026, the HTML served at `kids-test.harvous.com/kids.html`,
`family-test.harvous.com` and `app.harvous.com` included Cloudflare's Web Analytics beacon
(`static.cloudflareinsights.com/beacon.min.js`). It's injected at Cloudflare's edge, not by
Harvous code.

The notice promises "no ... optional analytics" for child accounts. `docs/CHILD_ACCOUNTS.md` says
"Do not enable Cloudflare Web Analytics or other tracking injection on this origin."

**Fix before launch,** in Cloudflare → Web Analytics → the harvous.com site: turn off automatic
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

1. Fix the Cloudflare Web Analytics injection, then confirm the beacon is gone.
2. Adopt the security program: fill it in, sign and date it.
3. Collect DPAs from Supabase, Fly, Cloudflare, Clerk and Epic; note backup and log retention.
4. Fill #72's placeholders, add the retention table and the (d)(3) sentence; add the "nothing
   without consent" and "no third-party disclosure" sentences to the notice (one new notice
   version).
5. Lawyer review of this document, the notice and #72.
6. Publish the policy, then submit KWS Production for Epic's review.
