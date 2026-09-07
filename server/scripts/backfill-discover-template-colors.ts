/**
 * Repair template listings written before the preview carried everything it
 * carries now — `iconColor`, and the rendered `bodyHtml` behind it.
 *
 * `snapshotTemplate` used to publish `NoteTemplates.iconColor` straight through.
 * That column is **null for every built-in** — their colour lives in
 * `getBuiltInTemplates()`, and only `resolveNoteTemplateIconColor` knows to look
 * there — so a listing for a built-in template published no colour at all, and
 * the catalog drew a template whose colour the author can plainly see in the
 * picker as though nobody had chosen one. It now resolves on write; this brings
 * the rows already written into line with what a fresh submit would produce.
 *
 * **The author's colour lives in `payload.iconColor`.** The first cut of this
 * script passed the *preview's* value (null, which is the whole reason the row
 * needed fixing) and so fell straight through to the slug hash — replacing "no
 * colour" with an invented one while the real answer sat in the payload beside
 * it. Six production rows were written that way before it was caught; re-running
 * corrects them, because the payload was never touched.
 *
 * `DiscoverListings.sourceId` is the `NoteTemplates` row id, which is what the
 * hash keys on when a template genuinely has no colour, so the value computed
 * here is the same one the templates sheet shows.
 *
 * **`bodyHtml` is regenerated from `payload.content`**, not re-read from the
 * source template — the payload *is* the snapshot, and going back to the live
 * row would quietly re-publish whatever its author has written since. Listings
 * without it fall back to `excerpt`, which is the same text with every block
 * boundary flattened, so a template's headings ran into their instructions and
 * the card showed one grey paragraph where a form should be.
 *
 * Touches `preview` only — presentation, never `payload` (provenance) and never
 * `status`. Idempotent: re-running writes nothing once the rows are correct.
 * Dry by default; pass `--apply` to write, and `--production` on top of that if
 * the target is the live database.
 */
import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { db, DiscoverListings } from '../db';
import { requireDbTarget } from '../utils/require-db-target';
import { resolveNoteTemplateIconColor } from '@/utils/note-template-icon';
import { bodyHtmlOf, excerptOf, headingsOf } from '../utils/discover-snapshot';

async function main() {
  const argv = process.argv.slice(2);
  const apply = argv.includes('--apply');
  requireDbTarget({
    scriptName: 'discover:template-colors',
    writes: apply,
    argv,
    env: process.env,
  });

  const rows = await db
    .select({
      id: DiscoverListings.id,
      slug: DiscoverListings.slug,
      title: DiscoverListings.title,
      sourceId: DiscoverListings.sourceId,
      payload: DiscoverListings.payload,
      preview: DiscoverListings.preview,
    })
    .from(DiscoverListings)
    .where(eq(DiscoverListings.kind, 'template'));

  let changed = 0;
  for (const row of rows) {
    let preview: Record<string, unknown>;
    try {
      preview = JSON.parse(row.preview ?? '{}') as Record<string, unknown>;
    } catch {
      console.log(`  SKIP  ${row.slug ?? row.id} — preview is not JSON`);
      continue;
    }
    const current = typeof preview.iconColor === 'string' ? preview.iconColor : null;
    /* The author's own choice, from the payload — the same value `snapshotTemplate`
       reads off the row at submit. Never `current`: that is the broken field. */
    let authored: string | null = null;
    let content: unknown = null;
    try {
      const payload = JSON.parse(row.payload ?? '{}') as {
        iconColor?: unknown;
        content?: unknown;
      };
      if (typeof payload.iconColor === 'string') authored = payload.iconColor;
      content = payload.content;
    } catch {
      /* A payload that will not parse is not this script's to fix. */
    }
    const resolved = resolveNoteTemplateIconColor(row.sourceId ?? row.id, authored);

    /* The snapshot's own content, re-rendered the way `snapshotTemplate` does
       it now. Only filled in when absent — a listing that already has a body
       keeps the bytes it was approved with. */
    const hasBody = typeof preview.bodyHtml === 'string' && preview.bodyHtml.length > 0;
    const body = !hasBody && typeof content === 'string' && content ? bodyHtmlOf(content) : null;

    const next: Record<string, unknown> = { ...preview, iconColor: resolved };
    if (body) {
      next.bodyHtml = body;
      next.headings = headingsOf(content as string);
      next.excerpt = excerptOf(content as string);
    }

    if (current === resolved && !body) {
      console.log(`  ok    ${row.slug ?? row.id} — ${resolved}`);
      continue;
    }
    changed += 1;
    const notes = [
      current !== resolved
        ? `${current ?? 'null'} → ${resolved}${authored ? " (author's)" : ' (hashed)'}`
        : null,
      body ? `+bodyHtml ${body.length} chars` : null,
    ].filter(Boolean);
    console.log(`  SET   ${row.slug ?? row.id} — ${notes.join(', ')}`);
    if (apply) {
      await db
        .update(DiscoverListings)
        .set({ preview: JSON.stringify(next) })
        .where(eq(DiscoverListings.id, row.id));
    }
  }

  console.log(
    `\n${rows.length} template listing(s); ${changed} would change` +
      (apply ? ' — applied.' : '. Dry run: pass --apply to write.'),
  );
}

/* `server/db` holds a pooled connection open, so the script has to say when it
   is done or it hangs after printing — and a hung script holds one of the 15
   session slots the project allows. */
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
