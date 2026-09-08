/**
 * Publish the templates Harvous ships with into the catalog.
 *
 * A brand-new catalog is empty and honestly so — nothing has been submitted —
 * but an empty page is a poor first impression of a feature whose whole point
 * is "here is study you can start from", and harvous.com's `/discover/` pages
 * exist to be found by people who do not have an account yet. The six built-in
 * study methods are the obvious thing to open with: they are real, they are
 * already what a new account gets, and they are ours to publish.
 *
 * **These do not go through submit → review.** That flow exists so a stranger's
 * work is read before it is public; the publisher here *is* Harvous, so a
 * round trip through a queue reviewing our own shipped content would be
 * theatre. They are written straight to `status: 'listed'` with
 * `preview.official`, which is what makes the card read "Included" rather than
 * crediting a person.
 *
 * A built-in has no `NoteTemplates` row — it lives in code — so `sourceId`
 * holds the built-in's own id (`soap`, `inductive`, …) rather than an `ntpl_`.
 * That is also what `resolveNoteTemplateIconColor` keys on, so each one keeps
 * the colour it wears in the app's own picker.
 *
 * Idempotent: matches on `sourceId`, updates in place rather than minting a
 * second listing, so re-running after a template's copy changes republishes it
 * instead of duplicating it. Dry by default; `--apply` writes, `--production`
 * on top when the target is live.
 */
import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { db, DiscoverListings } from '../db';
import { requireDbTarget } from '../utils/require-db-target';
import { getBuiltInTemplates } from '@/data/note-templates';
import { resolveNoteTemplateIconColor } from '@/utils/note-template-icon';
import { bodyHtmlOf, excerptOf, headingsOf } from '../utils/discover-snapshot';
import { isDiscoverCategory } from '@/data/discover-categories';

/** Where each shipped method belongs. Chosen once, here, rather than guessed
 *  per run — the reviewer files everything else, and these have no reviewer. */
const CATEGORY: Record<string, string> = {
  soap: 'daily-journal',
  text: 'daily-journal',
  inductive: 'deep-study',
  topical: 'topical-study',
  'chapter-summary': 'book-study',
  comparative: 'deep-study',
};

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
  requireDbTarget({ scriptName: 'discover:seed-builtins', writes: apply, argv, env: process.env });

  const now = new Date();
  let created = 0;
  let updated = 0;

  for (const template of getBuiltInTemplates()) {
    const category = CATEGORY[template.id];
    if (!category || !isDiscoverCategory(category)) {
      console.log(`  SKIP  ${template.id} — no category mapped`);
      continue;
    }

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
      /* The whole reason these can skip the queue: they are the product's. */
      official: true,
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
          .set({ title: template.name, description: template.description, category, payload, preview, updatedAt: now })
          .where(eq(DiscoverListings.id, existing.id));
      }
      continue;
    }

    created += 1;
    const slug = slugify(template.name);
    console.log(`  ${apply ? 'CREATE' : 'would create'}  ${slug.padEnd(20)} ${category.padEnd(15)} ${template.name}`);
    if (apply) {
      await db.insert(DiscoverListings).values({
        id: `dsc_${crypto.randomUUID()}`,
        kind: 'template',
        sourceId: template.id,
        submittedByUserId: process.env.HARVOUS_SYSTEM_USER_ID ?? 'harvous',
        /* Null on purpose — the card reads "Included" from `preview.official`,
           and a byline here would be a person who did not write it. */
        authorDisplayName: null,
        title: template.name,
        description: template.description,
        category,
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
