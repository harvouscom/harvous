# Content approval — Notes from Harvous (v1)

**Draft reference:** [DRAFT_V1.md](./DRAFT_V1.md) and `notes/*.html` (must match before publish).

## Approver checklist

- [ ] **Titles:** Every note title ≤ 50 characters; space/thread titles appropriate for cards.
- [ ] **Tone:** Peer voice for teachers/leaders; no hype (“transform,” “unlock,” “insights”); matches `docs/BRAND_VOICE.md`.
- [ ] **Product honesty:** No claiming Shared Spaces / church org curriculum as shipped; principles-first on systems note.
- [ ] **AI / tools theology:** Notes 05 and 11 align with Proverbs 25:2 posture and faith.tools norms; search not replaced.
- [ ] **Scripture:** References use verse-level form where pills matter; claims fit context (Proverbs 25:2, Psalm 139:23–24).
- [ ] **Questions note:** Note 09 is craft prose — not a standalone discussion-prompt list.
- [ ] **Links:** HTTPS; retrievalpractice.org, faith.tools, biblegateway.com, harvous.com blog URLs appropriate.
- [ ] **Safety / scope:** Welcome states not counseling; crisis line generic.
- [ ] **Shared content:** Only `default` notes in this pack.

## Sign-off (required before publish script)

| Field | Value |
|--------|--------|
| Approved for publish | ☐ Yes — ready for Harvous Admin API |
| Approver name(s) | _____________________________ |
| Date | _____________________________ |
| Notes (optional) | _____________________________ |

After sign-off, copy [SIGNOFF.template.txt](./SIGNOFF.template.txt) to `SIGNOFF.txt` (gitignored) with first line `APPROVED_FOR_PUBLISH`.

## Technical pre-review

Completed **2026-07-16** for v1 draft:

- [x] Eleven `notes/*.html` files; payload order matches [publish-payload.json](./publish-payload.json).
- [x] Title length audit — all note titles ≤ 50 chars.
- [x] Blog companion URLs listed in DRAFT_V1.
- [x] Featured disabled by default.

## Agent theologian pass (2026-07-16)

Reviewed blog posts *Notes-first vs AI*, *Tools help. Humans teach.*, *Asking better questions*, and companion notes 05 / 09 / 11 against `.claude/skills/theologian-agent/THEOLOGICAL_REVIEW_CHECKLIST.md`.

| Severity | Finding | Resolution |
|----------|---------|------------|
| Should-fix | Psalm 139:23–24 risked reading like a group method | Clarified as prayer/tone, not facilitation technique (blog + note 09) |
| Should-fix | “Glory meant for you” overclaimed Proverbs 25:2 | Softened to searching-matters posture, not full tech theology (blog + note 05) |
| Suggestion | Human approver still needed for community teaching alignment | Left open in checklist above |

No must-fix creedal or proof-text issues found. Product-honesty on systems note OK.

*Editorial/theological rows above still require a human approver before production publish.*
