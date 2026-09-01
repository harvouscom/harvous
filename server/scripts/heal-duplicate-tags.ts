/**
 * Heal duplicate Tags rows per user (same name, different ids) and repoint NoteTags links.
 *
 * For each `(userId, lower(name))` group with more than one Tag:
 * 1. Pick canonical tag (prefer `isSystem=false`, then oldest `createdAt`, then lowest id).
 * 2. Repoint NoteTags from duplicate tag ids → canonical (skip junction rows that would duplicate).
 * 3. Delete orphan duplicate Tag rows.
 *
 * Usage (requires `SUPABASE_DATABASE_URL` or `SUPABASE_DIRECT_URL` in env):
 *   npx tsx server/scripts/heal-duplicate-tags.ts --dry-run
 *   npx tsx server/scripts/heal-duplicate-tags.ts
 *   npx tsx server/scripts/heal-duplicate-tags.ts --userId=user_xxx
 */

import 'dotenv/config';
import { db } from '../db/client';
import { first } from '../db/helpers';
import { Tags, NoteTags } from '../db/schema';
import { and, eq } from 'drizzle-orm';
import { normalizeTagName } from '../utils/tag-helpers';
import { requireDbTarget } from '../utils/require-db-target';

function parseArgs() {
  const dryRun = process.argv.includes('--dry-run');
  let userId: string | undefined;
  for (const a of process.argv) {
    if (a.startsWith('--userId=')) userId = a.slice('--userId='.length).trim() || undefined;
  }
  return { dryRun, userId };
}

type TagRow = {
  id: string;
  name: string;
  userId: string;
  isSystem: boolean;
  createdAt: string;
};

function pickCanonicalTag(group: TagRow[]): TagRow {
  return [...group].sort((a, b) => {
    if (a.isSystem !== b.isSystem) return a.isSystem ? 1 : -1;
    const aCreated = Date.parse(a.createdAt);
    const bCreated = Date.parse(b.createdAt);
    if (aCreated !== bCreated) return aCreated - bCreated;
    return a.id.localeCompare(b.id);
  })[0];
}

async function main() {
  requireDbTarget({ scriptName: 'heal-duplicate-tags', writes: true });
  const { dryRun, userId } = parseArgs();
  console.log(dryRun ? '[dry-run] Scanning duplicate tags…' : 'Healing duplicate tags…');

  const allTags = await db.select().from(Tags);
  const scoped = userId ? allTags.filter((t) => t.userId === userId) : allTags;

  const groups = new Map<string, TagRow[]>();
  for (const tag of scoped) {
    const key = `${tag.userId}::${normalizeTagName(tag.name)}`;
    const list = groups.get(key) ?? [];
    list.push(tag);
    groups.set(key, list);
  }

  let duplicateGroups = 0;
  let tagsDeleted = 0;
  let linksRepointed = 0;
  let linksRemoved = 0;

  for (const [, group] of groups) {
    if (group.length < 2) continue;
    duplicateGroups++;
    const canonical = pickCanonicalTag(group);
    const duplicates = group.filter((t) => t.id !== canonical.id);

    console.log(
      `\n${dryRun ? '[dry-run] ' : ''}User ${canonical.userId}: "${canonical.name}" — keep ${canonical.id}, merge ${duplicates.map((d) => d.id).join(', ')}`,
    );

    for (const dup of duplicates) {
      const links = await db.select().from(NoteTags).where(eq(NoteTags.tagId, dup.id));

      for (const link of links) {
        const existingCanonical = first(
          await db
            .select()
            .from(NoteTags)
            .where(and(eq(NoteTags.noteId, link.noteId), eq(NoteTags.tagId, canonical.id)))
            .limit(1),
        );

        if (existingCanonical) {
          if (!dryRun) {
            await db.delete(NoteTags).where(eq(NoteTags.id, link.id));
          }
          linksRemoved++;
        } else {
          if (!dryRun) {
            await db.update(NoteTags).set({ tagId: canonical.id }).where(eq(NoteTags.id, link.id));
          }
          linksRepointed++;
        }
      }

      if (!dryRun) {
        await db.delete(Tags).where(eq(Tags.id, dup.id));
      }
      tagsDeleted++;
    }
  }

  console.log(
    `\nDone. duplicateGroups=${duplicateGroups} tagsDeleted=${tagsDeleted} linksRepointed=${linksRepointed} linksRemoved=${linksRemoved}${dryRun ? ' (dry-run — no writes)' : ''}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
