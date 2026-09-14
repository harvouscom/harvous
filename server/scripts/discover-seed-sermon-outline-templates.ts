/**
 * Publish the sermon outline templates into the catalog — Discover-only.
 *
 * A parallel to `discover-seed-builtin-templates.ts`, and deliberately not the
 * same script in two ways.
 *
 * First: that one seeds `getBuiltInTemplates()`, which is also every
 * account's own template picker, and these six do not belong there. Most
 * Harvous accounts are personal Bible study, not sermon prep, so putting six
 * pulpit-shaped options in front of every user by default would be clutter,
 * not help. `SERMON_OUTLINE_TEMPLATES` lives in its own file for exactly this
 * reason — see its docblock.
 *
 * Second, and the reason this docblock is not a copy of that one:
 * **`preview.official` is `false` here.** The built-in seed sets it `true`
 * because Harvous invented SOAP, TEXT, and the rest. It did not invent HBLT,
 * the three-act structure, or the other four — they are named preaching
 * frameworks surveyed at an outside article, and `official: true` would claim
 * an origin that is not true. The content itself (every heading and prompt)
 * is still Harvous's own writing, not copied from that article, so this is
 * not a byline either — `authorDisplayName` stays `null`, since no Harvous
 * account submitted these. What actually happened gets its own field:
 * `preview.sourceName` / `sourceUrl`, read by the site's `DiscoverListingPage`
 * to credit and link the source without claiming either "ours" or "theirs"
 * where neither is quite right. See `sourceCredit` in that file.
 *
 * Everything else matches the built-in seed: no submit → review (the
 * publisher is Harvous, so a queue reviewing our own content would be
 * theatre), written straight to `status: 'listed'`, idempotent on `sourceId`,
 * dry by default with `--apply` to write.
 *
 * A template seeded here has no `NoteTemplates` row of its own — like a
 * built-in, it lives in code — so `sourceId` holds the template's own id
 * (`hblt`, `sticky-sermon`, …). Install still works the ordinary way:
 * `prepareTemplateInstall` builds a fresh `NoteTemplates` row straight from
 * the listing's stored `payload`, the same as it does for SOAP or TEXT today
 * — nothing about install needs the source array these came from.
 */
import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { db, DiscoverListings } from '../db';
import { requireDbTarget } from '../utils/require-db-target';
import { SERMON_OUTLINE_TEMPLATES } from '@/data/sermon-outline-templates';
import { resolveNoteTemplateIconColor } from '@/utils/note-template-icon';
import { bodyHtmlOf, excerptOf, headingsOf } from '../utils/discover-snapshot';
import { isDiscoverCategory } from '@/data/discover-categories';

/** All six are sermon-prep — that is what they are, whole cloth, not a guess
 *  per template the way the built-in seed's map is. */
const CATEGORY = 'sermon-prep';

/** Where the six structures were surveyed, credited on every listing —
 *  see the docblock above for why this is neither `official` nor a byline. */
const SOURCE_NAME = 'Preach and Lead';
const SOURCE_URL = 'https://www.preachandlead.com/blog/outline-your-sermon';

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

async function main() {
  const argv = process.argv.slice(2);
  const apply = argv.includes('--apply');
  requireDbTarget({ scriptName: 'discover:seed-sermon-templates', writes: apply, argv, env: process.env });

  if (!isDiscoverCategory(CATEGORY)) {
    throw new Error(`"${CATEGORY}" is not a category Discover knows`);
  }

  const now = new Date();
  let created = 0;
  let updated = 0;

  for (const template of SERMON_OUTLINE_TEMPLATES) {
    const payload = JSON.stringify({
      name: template.name,
      title: template.titleTemplate || null,
      content: template.content,
      noteType: template.noteType,
      iconColor: template.iconColor,
    });

    const preview = JSON.stringify({
      titleTemplate: template.titleTemplate || null,
      iconColor: resolveNoteTemplateIconColor(template.id, template.iconColor),
      headings: headingsOf(template.content),
      excerpt: excerptOf(template.content),
      bodyHtml: bodyHtmlOf(template.content),
      /* Not `official` — see the file docblock. These skip submit → review
         because Harvous is still the one publishing them, but the shape is
         credited to where it was surveyed, not claimed as invented here. */
      official: false,
      sourceName: SOURCE_NAME,
      sourceUrl: SOURCE_URL,
    });

    const existing = (
      await db
        .select({ id: DiscoverListings.id, slug: DiscoverListings.slug })
        .from(DiscoverListings)
        .where(eq(DiscoverListings.sourceId, template.id))
        .limit(1)
    )[0];

    if (existing) {
      updated += 1;
      console.log(`  ${apply ? 'UPDATE' : 'would update'}  ${existing.slug} — ${template.name}`);
      if (apply) {
        await db
          .update(DiscoverListings)
          .set({
            title: template.name,
            description: template.description,
            category: CATEGORY,
            payload,
            preview,
            updatedAt: now,
          })
          .where(eq(DiscoverListings.id, existing.id));
      }
      continue;
    }

    created += 1;
    const slug = slugify(template.name);
    console.log(`  ${apply ? 'CREATE' : 'would create'}  ${slug.padEnd(24)} ${CATEGORY.padEnd(15)} ${template.name}`);
    if (apply) {
      await db.insert(DiscoverListings).values({
        id: `dsc_${crypto.randomUUID()}`,
        kind: 'template',
        sourceId: template.id,
        submittedByUserId: process.env.HARVOUS_SYSTEM_USER_ID ?? 'harvous',
        /* Null on purpose — this field means "the Harvous account that
           submitted this," and none did. The credit is `preview.sourceName`
           instead, which names where the shape came from without claiming a
           person handed it to Harvous. */
        authorDisplayName: null,
        title: template.name,
        description: template.description,
        category: CATEGORY,
        slug,
        payload,
        preview,
        status: 'listed',
        installCount: 0,
        listedAt: now,
        staffReadAt: now,
        reviewedAt: now,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  console.log(
    `\n${created} to create, ${updated} to update` +
      (apply ? ' — applied.' : '. Dry run: pass --apply to write.'),
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
