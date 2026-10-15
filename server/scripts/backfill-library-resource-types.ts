/**
 * Give every library item saved before resource types existed its type.
 *
 * Defaults to a dry run that prints what it would write; writes need `--apply`. Only rows with
 * no type are touched, so a type someone already chose — or the viewer already filled in — is
 * never overwritten, and running it twice is a no-op the second time.
 *
 * Links get the page fetched (through the same private-address guard reader view uses) so a
 * video page is typed as a video; a page that will not load still gets the URL-rule type.
 *
 * Usage:
 *   npx tsx server/scripts/backfill-library-resource-types.ts
 *   npx tsx server/scripts/backfill-library-resource-types.ts --apply
 *   npx tsx server/scripts/backfill-library-resource-types.ts --no-fetch   # URL rules only
 */
import 'dotenv/config';
import { db, LibraryItems, and, eq, isNull } from '../db';
import { detectResourceType } from '../utils/resource-type-detect';
import { fetchPublicText } from '../utils/public-url-fetch';

const apply = process.argv.includes('--apply');
const fetchPages = !process.argv.includes('--no-fetch');
const CONCURRENCY = 4;

type Row = Pick<
  typeof LibraryItems.$inferSelect,
  'id' | 'kind' | 'title' | 'sourceUrl' | 'fileMime' | 'fileName'
>;

async function pageFor(row: Row): Promise<{ html: string; url: string } | null> {
  if (!fetchPages || row.kind !== 'link' || !row.sourceUrl) return null;
  try {
    const page = await fetchPublicText(row.sourceUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; HarvousBot/1.0; +https://app.harvous.com)' },
    });
    if (page.status < 200 || page.status >= 300 || !/html/i.test(page.contentType)) return null;
    return { html: page.body, url: page.url.toString() };
  } catch {
    return null;
  }
}

async function main() {
  const rows: Row[] = await db
    .select({
      id: LibraryItems.id,
      kind: LibraryItems.kind,
      title: LibraryItems.title,
      sourceUrl: LibraryItems.sourceUrl,
      fileMime: LibraryItems.fileMime,
      fileName: LibraryItems.fileName,
    })
    .from(LibraryItems)
    .where(isNull(LibraryItems.resourceType));

  console.log(`${rows.length} untyped item(s). ${apply ? 'Writing.' : 'Dry run — pass --apply to write.'}`);
  const counts: Record<string, number> = {};
  let written = 0;

  for (let i = 0; i < rows.length; i += CONCURRENCY) {
    const batch = rows.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (row) => {
        const type = detectResourceType(row, await pageFor(row));
        counts[type] = (counts[type] ?? 0) + 1;
        console.log(`${type.padEnd(8)} ${row.id}  ${row.title.slice(0, 60)}`);
        if (!apply) return;
        await db
          .update(LibraryItems)
          .set({ resourceType: type })
          .where(and(eq(LibraryItems.id, row.id), isNull(LibraryItems.resourceType)));
        written += 1;
      }),
    );
  }

  console.log('By type:', counts);
  if (apply) console.log(`Wrote ${written} row(s).`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
