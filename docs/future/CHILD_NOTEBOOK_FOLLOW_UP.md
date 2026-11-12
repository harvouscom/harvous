# Child notebook follow-up

Production enrollment is off. Use fictional child accounts in [Harvous Staging](https://family-test.harvous.com/settings/family). The [child accounts runbook](../CHILD_ACCOUNTS.md) has the deployment steps, and the [privacy publication checklist](../privacy/CHILD_PRIVACY_PUBLICATION_CHECKLIST.md) covers the notice and operational review.

## Family-selected Bible translations

The child catalog uses **Easy-to-Read Version (ERV)**, **Contemporary English Version (CEV)**, and **New Life Version (NLV)**. New notebooks start with ERV approved. Parents can enable CEV and NLV in Family Bible settings. Existing approvals can remain in place for notebooks that used the staging catalog.

Read Together opens a shared chapter in the edition the parent selected. The Family Bible picker includes the translation so two shares of the same chapter are distinguishable. Each share keeps its own verse thoughts. To read in another edition together, share the chapter again in that edition.

The import uses the [Bolls bulk files](https://github.com/Bolls-Bible/bain/blob/master/docs/API.md#get-a-full-translation). CEV uses the Genesis–Revelation books from the CEVD source. Imported verses keep their source numbering, including gaps or combined verses. Seed the three editions in the target environment before releasing the updated child catalog.

- [x] Let a family build its approved translation list from the wider catalog. **Family Bible → Approved translations** lists the three young-reader editions first (marked *Written for young readers*), then **More translations** with the rest of the Harvous catalog (`familyAddableBibleTranslations`). The server refuses one whose text isn't in that environment's database. Licensing for showing each added translation on the separate child site is still open (see production checks below).
- [ ] Decide how a family’s approved list applies when it has more than one child notebook. Preserve the existing per-notebook approvals during rollout and make the scope of a change clear in Settings.
- [x] Keep at least one translation approved per notebook. The server enforces approvals for **My Bible**, child access to **Family Bible**, and sharing a chapter. Staging verified that removing an approval hides a shared chapter from the child and restoring it brings the chapter and its thoughts back.
- [x] Verify that the current approval controls save and retain a change after reload. Staging also verified that BSB, NIV, and NLT return readable text in both Bible views.
- [ ] Verify the wider catalog in the child picker with multiple translations approved. Confirm text availability for every offered translation in the target environment.

## Staging rehearsal

Completed November 11, 2026, on the isolated Harvous staging sites with fictional child accounts.

- [x] A real KWS Test verification reached Harvous. The repeatable rehearsal used signed fictional callbacks and verified the Plus requirement, consent before creation, single-use sign-in links, export, withdrawal, and deletion.
- [x] **Use child mode on this device** signed out the parent in desktop and mobile Chromium. Returning to parent mode ended the child session and required fresh Clerk sign-in, including when an adult session was already open in a second tab. Desktop Back did not reopen the notebook. Refresh on mobile required a new link. The rehearsal used short-lived Clerk test tickets for the fictional parent.
- [x] Two fictional families exercised note and parent-control isolation, export, search, Family Bible, and ministry permissions. The intended family saw both verse thoughts. Removing a shared chapter removed its thoughts. Removing ministry approval or the parent's membership removed the reading from search and blocked direct access.
- [x] Cloudflare automatically ran the staging retention job, reported success, and deleted an expired fictional verification record. The staging trigger was returned to 04:17 UTC daily.
- [x] Compared the populated staging notebook with the local preview in light and dark mode, including the welcome layout, writing dock, Family Bible, and privacy panel. The live activity stack and labels use the actual dates and note details. Also checked the empty state on desktop and mobile.
- [x] Verified that the parent export preserves the child’s note IDs, folders, tag and Thread links, and Scripture references. Verified that a withdrawn session cannot save an edit.
- [ ] Confirm production Scripture attribution and permission scope for the separate child origin. The NLT seed reported verse-count differences in Numbers 1–2, where several entries represent combined verses. Check verse numbering and anchoring when a family reads or discusses those passages.

## Prepare production enrollment

- [ ] Review the production child privacy notice and age-policy update, along with the actual data handling, backup retention, vendor arrangements, and parent rights procedures in the publication checklist.
- [x] Verify the privacy policy link in staging. It opens from the child landing and notebook, and appears in search, the note editor, notebook settings, and the Family Bible thought form. The published production policy still needs its own verification.
- [x] Open a [draft release pull request](https://github.com/harvouscom/harvous/pull/320) against the current production code. The API, adult SPA, and separate child build passed. The adult bundle passed the CI-equivalent size budget without changing the budget. The offline suite passed locally (8,513 passed, eight database-backed tests skipped).
- [x] Apply the reviewed additive production migration with enrollment closed. Verify row-level security on all seven new tables.
- [ ] Set up KWS Production with its own credentials and signed callback. Provision the separate production child origin with enrollment closed.
- [ ] Verify the production callback, scheduled retention, and parent and child smoke tests. Enable real enrollment after those checks and the privacy review pass.

## Handoff when a child turns 13

A new user who is already 13 or older can use the standard Harvous signup. An existing child notebook stays parent-managed today. Harvous records under-13 eligibility at enrollment, so the transition needs a deliberate action in **My Family**.

- [ ] Design a handoff that verifies the guardian’s authorization and lets the teen claim the notebook with their own Harvous sign-in.
- [ ] Preserve the private notebook’s notes, folders, tags, Threads, and Scripture references. Define which Family Bible and ministry resources stay governed by family permissions.
- [ ] Explain when the parent’s notebook access ends and end old child sessions at cutover. Test unauthorized, interrupted, and repeated handoffs, along with data integrity after a successful transfer.
