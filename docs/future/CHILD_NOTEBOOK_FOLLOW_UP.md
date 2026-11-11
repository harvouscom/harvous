# Child notebook follow-up

Production enrollment is off. Use fictional child accounts in [Harvous Staging](https://family-test.harvous.com/settings/family). The [child accounts runbook](../CHILD_ACCOUNTS.md) has the deployment steps, and the [privacy publication checklist](../privacy/CHILD_PRIVACY_PUBLICATION_CHECKLIST.md) covers the notice and operational review.

## Family-selected Bible translations

Today, Harvous offers BSB, NIV, and NLT for child notebooks. BSB starts enabled, and a parent can turn on any of the three for a specific child. All three opened Psalm 23 in both My Bible and Family Bible during the staging rehearsal.

- [ ] Let a family build its approved translation list from the wider catalog of translations Harvous can serve in child mode. Add an **Add translation** action in **Family Bible → Approved translations** using the existing Harvous translation picker.
- [ ] Decide how a family’s approved list applies when it has more than one child notebook. Preserve the existing per-notebook approvals during rollout and make the scope of a change clear in Settings.
- [ ] Keep at least one approved translation available. Enforce approvals on the server for **My Bible**, **Family Bible**, and chapter sharing. Make sure offered translations have readable text in the target environment.
- [ ] Verify the default, adding and removing a translation, the picker when multiple translations are approved, and what happens to shared chapters when their translation is removed and later approved again.

## Staging rehearsal

Completed November 11, 2026, on the isolated Harvous staging sites with fictional child accounts.

- [x] A real KWS Test verification reached Harvous. The repeatable rehearsal used signed fictional callbacks and verified the Plus requirement, consent before creation, single-use sign-in links, export, withdrawal, and deletion.
- [x] **Use child mode on this device** signed out the parent in desktop and mobile Chromium. Returning to parent mode ended the child session and required fresh Clerk sign-in, including when an adult session was already open in a second tab. Desktop Back did not reopen the notebook. Refresh on mobile required a new link. The rehearsal used short-lived Clerk test tickets for the fictional parent.
- [x] Two fictional families exercised note and parent-control isolation, export, search, Family Bible, and ministry permissions. The intended family saw both verse thoughts. Removing a shared chapter removed its thoughts. Removing ministry approval or the parent's membership removed the reading from search and blocked direct access.
- [x] Cloudflare automatically ran the staging retention job, reported success, and deleted an expired fictional verification record. The staging trigger was returned to 04:17 UTC daily.
- [x] Compared the populated staging notebook with the local preview in light and dark mode, including the welcome layout, writing dock, Family Bible, and privacy panel. The live activity stack and labels use the actual dates and note details. Also checked the empty state on desktop and mobile.
- [ ] Confirm production Scripture attribution and permission scope for the separate child origin. The NLT seed reported verse-count differences in Numbers 1–2, where several entries represent combined verses. Check verse numbering and anchoring when a family reads or discusses those passages.

## Prepare production enrollment

- [ ] Review the production child privacy notice and age-policy update, along with the actual data handling, backup retention, vendor arrangements, and parent rights procedures in the publication checklist.
- [x] Open a [draft release pull request](https://github.com/harvouscom/harvous/pull/320) against the current production code. The API, adult SPA, and separate child build passed. The adult bundle passed the CI-equivalent size budget without changing the budget. The offline suite passed locally (8,513 passed, eight database-backed tests skipped).
- [ ] Set up KWS Production with its own credentials and signed callback. Apply the reviewed additive database migration to the production target before merging the release, and provision the separate child origin.
- [ ] Verify the production callback, scheduled retention, and parent and child smoke tests. Enable real enrollment after those checks and the privacy review pass.

## Handoff when a child turns 13

A new user who is already 13 or older can use the standard Harvous signup. An existing child notebook stays parent-managed today. Harvous records under-13 eligibility at enrollment, so the transition needs a deliberate action in **My Family**.

- [ ] Design a handoff that verifies the guardian’s authorization and lets the teen claim the notebook with their own Harvous sign-in.
- [ ] Preserve the private notebook’s notes, folders, tags, Threads, and Scripture references. Define which Family Bible and ministry resources stay governed by family permissions.
- [ ] Explain when the parent’s notebook access ends and end old child sessions at cutover. Test unauthorized, interrupted, and repeated handoffs, along with data integrity after a successful transfer.
