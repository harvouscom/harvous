/**
 * Publish the references Harvous curates into the catalog.
 *
 * Sister to `discover-seed-builtin-templates.ts`, and the same argument for
 * skipping submit → review: that flow exists so a stranger's work is read
 * before it is public, and the publisher here *is* Harvous. These go straight
 * to `status: 'listed'`.
 *
 * What they are for: until now a curated reference on harvous.com could only
 * send a reader to the publisher. Discover's whole purpose is that you find
 * something and then take it with you, so every one of these needs a row here —
 * `POST /api/discover/install` resolves a slug against this table, and a slug
 * it has never seen is a dead "Add to my Harvous" button.
 *
 * Installing one saves a **link** to the reader's own library, via
 * `prepareResourceInstall`. Nothing of the publisher's is copied, which is both
 * what the code does and what their terms tend to ask for. `payload` is
 * therefore exactly a `ResourcePayload`, and its `sourceUrl` is re-validated at
 * install time by `validateResourceUrl` — which is why every URL in
 * `CURATED_RESOURCES` is absolute, including our own blog posts.
 *
 * Like a built-in template, a curated reference has no row of its own to point
 * at: it is a link to somebody else's page, not a `LibraryItems` record under
 * some system account. So `sourceId` holds `curated:<slug>`, prefixed so it can
 * never collide with a built-in's id (`soap`) or a real `ntpl_`/`libi_`.
 *
 * `preview` carries the publisher lockup nested under `source`, plus
 * `resourceType`, `video` and our `note`. `serializePublic` emits `preview`
 * whole, so harvous.com receives all of it with no change to the export —
 * the same trick the built-in seeder uses to add `official: true`. Nested and
 * named for the type on purpose: the flat `preview.sourceName`/`sourceUrl` mean
 * something narrower on the site ("Harvous wrote this, crediting an outside
 * structure") and drive different copy.
 *
 * Idempotent: matches on `sourceId`, updates in place, and never touches
 * `slug`, `status`, `installCount` or `listedAt` — so a re-run after a copy
 * edit republishes rather than duplicating, and cannot resurrect a delisted
 * row or reset what people have already installed. Dry by default; `--apply`
 * writes, `--production` on top when the target is live.
 */
import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { db, DiscoverListings } from '../db';
import { requireDbTarget } from '../utils/require-db-target';
import { CURATED_RESOURCES, type CuratedResource } from '@/data/curated-resources';
import { isDiscoverCategory } from '@/data/discover-categories';
import { validateResourceUrl } from '@/utils/validation';

/** Matches `EXCERPT_MAX_LENGTH` in discover-snapshot.ts. */
const EXCERPT_MAX_LENGTH = 220;

/** `sourceId` for a reference. Prefixed so it cannot collide with a built-in
 *  template's id or a real row id. */
function sourceIdFor(entry: CuratedResource): string {
  return `curated:${entry.slug}`;
}

/**
 * Exactly a `ResourcePayload` — this is what `prepareResourceInstall` reads.
 *
 * `sourceImage` is null rather than the poster harvous.com mirrors: that file
 * lives on the marketing site's disk under a path this repo does not serve, so
 * pointing a library item at it would be a broken thumbnail.
 */
function payloadFor(entry: CuratedResource): string {
  return JSON.stringify({
    title: entry.title,
    description: entry.description,
    sourceUrl: entry.source.url,
    sourceDomain: entry.source.domain,
    sourceSiteName: entry.source.name,
    sourceImage: null,
  });
}

function previewFor(entry: CuratedResource): string {
  return JSON.stringify({
    /* Somebody else's work, so never "Included". */
    official: false,
    sourceDomain: entry.source.domain,
    sourceSiteName: entry.source.name,
    excerpt: entry.description.slice(0, EXCERPT_MAX_LENGTH),
    source: entry.source,
    resourceType: entry.resourceType,
    ...(entry.video ? { video: entry.video } : {}),
    note: entry.note,
  });
}

async function main() {
  const argv = process.argv.slice(2);
  const apply = argv.includes('--apply');
  requireDbTarget({ scriptName: 'discover:seed-curated', writes: apply, argv, env: process.env });

  const now = new Date();
  let created = 0;
  let updated = 0;
  let skipped = 0;

  const seenSlugs = new Set<string>();

  for (const entry of CURATED_RESOURCES) {
    /* Validate before writing, not after: a bad category is a card the topic
       filter never matches, and a URL `validateResourceUrl` rejects is a listing
       whose install button fails for every reader who presses it. Both are
       silent in production and obvious here. */
    if (!isDiscoverCategory(entry.category)) {
      console.log(`  SKIP  ${entry.slug} — category "${entry.category}" is not one Discover knows`);
      skipped += 1;
      continue;
    }
    if (seenSlugs.has(entry.slug)) {
      console.log(`  SKIP  ${entry.slug} — listed twice in CURATED_RESOURCES`);
      skipped += 1;
      continue;
    }
    seenSlugs.add(entry.slug);

    const urlCheck = validateResourceUrl(entry.source.url);
    if (!urlCheck.isValid) {
      console.log(`  SKIP  ${entry.slug} — source.url rejected at install: ${urlCheck.error}`);
      skipped += 1;
      continue;
    }

    const sourceId = sourceIdFor(entry);
    const payload = payloadFor(entry);
    const preview = previewFor(entry);

    const existing = (
      await db
        .select({ id: DiscoverListings.id, slug: DiscoverListings.slug })
        .from(DiscoverListings)
        .where(eq(DiscoverListings.sourceId, sourceId))
        .limit(1)
    )[0];

    if (existing) {
      updated += 1;
      console.log(`  ${apply ? 'UPDATE' : 'would update'}  ${existing.slug} — ${entry.title}`);
      if (apply) {
        await db
          .update(DiscoverListings)
          .set({
            title: entry.title,
            description: entry.description,
            category: entry.category,
            /* The publisher is the author, which is what the card's byline
               reads. Kept in step on update: a source can be renamed. */
            authorDisplayName: entry.source.name,
            payload,
            preview,
            updatedAt: now,
          })
          .where(eq(DiscoverListings.id, existing.id));
      }
      continue;
    }

    created += 1;
    console.log(
      `  ${apply ? 'CREATE' : 'would create'}  ${entry.slug.padEnd(40)} ` +
        `${entry.category.padEnd(15)} ${entry.source.name}`,
    );
    if (apply) {
      await db.insert(DiscoverListings).values({
        id: `dsc_${crypto.randomUUID()}`,
        kind: 'resource',
        sourceId,
        submittedByUserId: process.env.HARVOUS_SYSTEM_USER_ID ?? 'harvous',
        /* The publisher, not a person: these were curated by Harvous, and the
           name worth showing on the card is whose work it is. */
        authorDisplayName: entry.source.name,
        title: entry.title,
        description: entry.description,
        category: entry.category,
        /* Authored, never slugified from the title: these slugs are already
           published URLs on harvous.com and the column is immutable after
           approval. */
        slug: entry.slug,
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
      (skipped ? `, ${skipped} skipped` : '') +
      (apply ? ' — applied.' : '. Dry run: pass --apply to write.'),
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
