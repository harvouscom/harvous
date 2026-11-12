# Child privacy notice: publication requirements

The in-app direct notice is `spa/src/pages/family/ChildPrivacyNotice.tsx`, versioned by `CHILD_NOTICE_VERSION` in `shared/child-notebook.ts`. The parent app submits the version it displays and the API validates it before recording consent. `HARVOUS_CHILD_PRIVACY_URL` points to the full published policy. Enrollment requires this URL.

Before publishing that policy, supply and verify:

- Testament Made LLC supplied the email, mailing address, and telephone number for parent privacy inquiries. Verify that the published policy uses the supplied contact details. [COPPA notice rule](https://www.ecfr.gov/current/title-16/chapter-I/subchapter-C/part-312/section-312.4)
- Verify the published policy opens from the child landing and notebook, and beside the note, search, Family Bible thought, and settings controls that send child information. The link and the parent consent notice should use the same reviewed policy URL.
- Inspect outgoing requests from the child site, parent Family and Child notebooks settings, and the public child privacy page. Verify optional analytics, including dashboard-injected scripts, receive no notebook IDs, request URLs, or child content. Retain only the infrastructure logging needed to operate and protect the service.
- The operators/service providers collecting or maintaining information, their purposes, and their child-specific contracts. Review API hosting, CDN/security logs, database/backups, parent authentication, and KWS and its verification processors.
- Exactly what is collected before verification (adult account/email plus the consent request), after verification/consent (first name or nickname, under-13 eligibility, notes, notebook preferences, Family Bible readings and thoughts, My Bible highlights and stickers, Look back progress, and permissions), and automatically for necessary service/security functions.
- Parent review/export, consent withdrawal, deletion, and contact procedures, including verification of an off-platform rights request and handling guardianship disputes.
- The retention schedule in `docs/CHILD_ACCOUNTS.md`, plus the **actual** backup expiry, logging retention, deletion propagation, and restoration safeguards. The code does not erase a provider’s backups.
- No optional advertising, sale, behavioral tracking, social discovery, direct messaging, public child content, or third-party AI processing in this pilot.
- Family Bible thoughts are visible to the child and the parent managing the notebook. Parent review and export include the child’s thoughts. Removing a shared reading deletes its thoughts.
- Read-only ministry channel approval; the parent’s continued channel membership is required. Ministry leaders do not receive child identities or private notebooks.
- How material changes require renewed parental consent. A notice-version change pauses every notebook agreed under the older version. The parent renews from that notebook's page in My Family (the updated notice and the same guardian confirmation as setup), which records the current version and a new consent date. Withdrawn notebooks never resume there. Each agreement is also kept in a consent history (version, date, created or renewed), shown to the parent and included in the export. It is deleted with the notebook; confirm with counsel whether consent records must outlive deletion.
- Archive the published policy and the direct notice shown for each consent version. Align the website effective dates and the app’s Terms and Privacy acknowledgment versions in `src/utils/legal-versions.ts` when publishing changes.
- US-only launch scope. Assess state-specific requirements and any broader launch separately. Keep independent adult/teen signup’s existing 13+ rule.
- Operational ownership: security program, vendor reviews, access reviews, incident response, retention monitoring, deletion verification, and legal review of KWS verification methods and guardianship attestation.

Do not claim “COPPA certified” because Harvous uses KWS. Do not enable real child enrollment until the actual product and operational practices have been reviewed.

Notice version `2026-11-12.1` lists My Bible highlights, verse stickers, and Look back progress (what comes back, when, and how each answer went), so the notice matches the product before any production enrollment. Staging notebooks agreed under `2026-11-11.2` pause until renewed. Counsel should still review the wording.
