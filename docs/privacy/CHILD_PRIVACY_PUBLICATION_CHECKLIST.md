# Child privacy notice: publication requirements

The in-app direct notice is `spa/src/pages/family/ChildPrivacyNotice.tsx`, versioned by `CHILD_NOTICE_VERSION` in `server/family/policy.ts`. It describes the implemented US pilot, not a legal certification. The full policy is deliberately configured by `HARVOUS_CHILD_PRIVACY_URL`; enrollment cannot open without it.

Before publishing that policy, supply and verify:

- Testament Made LLC supplied the email, mailing address, and telephone number for parent privacy inquiries. Verify that the published policy uses the supplied contact details. [COPPA notice rule](https://www.ecfr.gov/current/title-16/chapter-I/subchapter-C/part-312/section-312.4)
- Verify the published policy opens from the child landing and notebook, and beside the note, search, Family Bible thought, and settings controls that send child information. The link and the parent consent notice should use the same reviewed policy URL.
- The operators/service providers collecting or maintaining information, their purposes, and their child-specific contracts. Review API hosting, CDN/security logs, database/backups, parent authentication, and KWS and its verification processors.
- Exactly what is collected before verification (adult account/email plus the consent request), after verification/consent (first name or nickname, under-13 eligibility, notes, notebook preferences, Family Bible readings and thoughts, and permissions), and automatically for necessary service/security functions.
- Parent review/export, consent withdrawal, deletion, and contact procedures, including verification of an off-platform rights request and handling guardianship disputes.
- The retention schedule in `docs/CHILD_ACCOUNTS.md`, plus the **actual** backup expiry, logging retention, deletion propagation, and restoration safeguards. The code does not erase a provider’s backups.
- No optional advertising, sale, behavioral tracking, social discovery, direct messaging, public child content, or third-party AI processing in this pilot.
- Family Bible thoughts are visible to the child and the parent managing the notebook. Parent review and export include the child’s thoughts. Removing a shared reading deletes its thoughts.
- Read-only ministry channel approval; the parent’s continued channel membership is required. Ministry leaders do not receive child identities or private notebooks.
- How material changes require renewed parental consent. The current implementation fails closed on notice-version changes; renewal UX is a prerequisite to changing the notice for an active pilot.
- US-only launch scope. Assess state-specific requirements and any broader launch separately. Keep independent adult/teen signup’s existing 13+ rule.
- Operational ownership: security program, vendor reviews, access reviews, incident response, retention monitoring, deletion verification, and legal review of KWS verification methods and guardianship attestation.

Do not claim “COPPA certified” because Harvous uses KWS. Do not enable real child enrollment until the actual product and operational practices have been reviewed.
