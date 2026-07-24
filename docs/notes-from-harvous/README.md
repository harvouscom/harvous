# Notes from Harvous (curated pack)

Companion notes for the church-education blog series on [harvous.com/blog](https://harvous.com/blog/). Practice-first notes for teachers and group leaders. **Draft pack** — do not production-publish until human sign-off.

## Files

| File | Purpose |
|------|---------|
| [DRAFT_V1.md](./DRAFT_V1.md) | Space, thread, note map, bibliography |
| [APPROVAL.md](./APPROVAL.md) | Editorial / theological checklist |
| [SIGNOFF.template.txt](./SIGNOFF.template.txt) | Copy to `SIGNOFF.txt` after approval (gitignored) |
| [publish-payload.json](./publish-payload.json) | Admin publish config + ordered notes |
| `notes/*.html` | TipTap-compatible bodies (`default` only) |

## Validate (no API)

```bash
npm run notes-from-harvous:publish -- --validate-only
```

## Publish (after human approval)

Same gate as Easter 2026:

1. Complete [APPROVAL.md](./APPROVAL.md).
2. Copy `SIGNOFF.template.txt` → `SIGNOFF.txt` with first line `APPROVED_FOR_PUBLISH`.
3. `.env`: `HARVOUS_ADMIN_SECRET`, `HARVOUS_SYSTEM_USER_ID`.
4. API on port 3001 (`npm run dev:api`) or set `NOTES_FROM_HARVOUS_PUBLISH_API_BASE`.
5. Run:

```bash
npm run notes-from-harvous:publish -- --dry-run   # optional
npm run notes-from-harvous:publish
```

Featured card is **disabled** in the payload by default. Pass nothing extra; use Easter’s `--no-featured` pattern is already the default here via `featured.enabled: false`.

## Relationship to the blog

Each note compresses a longer essay. Blog URLs are linked from the HTML. Do not paste full essays into the app. Until this pack is published, blog posts should not promise an in-app join link.
