/**
 * Publish a Harvous-authored study plan into Discover as an official pack.
 *
 * Same reasoning as `discover-seed-builtin-templates.ts`: the publisher is
 * Harvous, so this skips submit → review and writes the listing straight to
 * `status: 'listed'` with `preview.official`. The review happens before this
 * runs, in the plan folder's README (theological review, then Derek's approval).
 *
 * A plan folder holds `plan.json` and `notes/*.html`. The steps become a pack
 * whose `sequence` lists them in order, so an install lands as a study plan —
 * steps, order and progress — rather than a plain Thread. See PackPayload.
 *
 * There is no source Thread: the files are the source, and `sourceId` is the
 * plan's own stable id. Idempotent on that id, so re-running after an edit
 * republishes in place. People who already installed keep their copy.
 *
 * `--submit` puts it in the admin review queue instead (`status: 'submitted'`,
 * no slug yet), so it can be read in the app and approved from admin Discover,
 * which is what assigns the slug and lists it. Nothing is public until then.
 *
 * Usage (dry by default):
 *   npx tsx server/scripts/discover-publish-plan.ts docs/advent-2026-study-plan
 *   npx tsx server/scripts/discover-publish-plan.ts docs/advent-2026-study-plan --apply [--submit] [--production]
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import { db, DiscoverListings } from '../db';
import { requireDbTarget } from '../utils/require-db-target';
import { bodyHtmlOf, excerptOf, type PackPayload } from '../utils/discover-snapshot';
import { isDiscoverCategory } from '@/data/discover-categories';

const MAX_STEP_TITLE = 50;

export interface PlanFile {
  sourceId: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  thread: { title: string; subtitle: string | null; color: string };
  steps: Array<{ title: string; contentFile: string }>;
}

/** Pure: plan + step bodies → the listing's payload and preview. Exported for tests. */
export function buildPlanListing(plan: PlanFile, bodies: string[], authorId: string) {
  if (!plan.sourceId || !plan.slug || !plan.title) throw new Error('plan.json needs sourceId, slug and title');
  if (!isDiscoverCategory(plan.category)) throw new Error(`Unknown category: ${plan.category}`);
  if (plan.steps.length === 0 || plan.steps.length !== bodies.length) throw new Error('Every step needs a body');
  plan.steps.forEach((step, i) => {
    if (!step.title || step.title.length > MAX_STEP_TITLE) {
      throw new Error(`Step title must be 1–${MAX_STEP_TITLE} characters: "${step.title}"`);
    }
    if (!bodies[i]?.trim()) throw new Error(`Empty body: ${step.contentFile}`);
  });

  const stepSourceIds = plan.steps.map((_, i) => `${plan.sourceId}:step-${i + 1}`);
  const payload: PackPayload = {
    thread: plan.thread,
    notes: plan.steps.map((step, i) => ({
      sourceId: stepSourceIds[i],
      sourceVersionId: null,
      sourceAuthorId: authorId,
      title: step.title,
      content: bodies[i],
      noteType: 'default',
    })) as PackPayload['notes'],
    references: [],
    sequence: { stepSourceIds },
  };
  const preview = {
    noteCount: plan.steps.length,
    stepCount: plan.steps.length,
    titles: plan.steps.map((s) => s.title),
    excerpt: excerptOf(bodies[0]),
    bodyHtml: bodyHtmlOf(bodies[0]),
    official: true,
  };
  return { payload: JSON.stringify(payload), preview: JSON.stringify(preview) };
}

async function main() {
  const argv = process.argv.slice(2);
  const folder = argv.find((a) => !a.startsWith('--'));
  if (!folder) throw new Error('Pass the plan folder, e.g. docs/advent-2026-study-plan');
  const apply = argv.includes('--apply');
  const submitOnly = argv.includes('--submit');
  requireDbTarget({ scriptName: 'discover:publish-plan', writes: apply, argv, env: process.env });

  const dir = resolve(process.cwd(), folder);
  const plan = JSON.parse(readFileSync(resolve(dir, 'plan.json'), 'utf-8')) as PlanFile;
  const bodies = plan.steps.map((s) => readFileSync(resolve(dir, 'notes', s.contentFile), 'utf-8').trim());
  const authorId = process.env.HARVOUS_SYSTEM_USER_ID ?? 'harvous';
  const { payload, preview } = buildPlanListing(plan, bodies, authorId);
  const now = new Date();

  const existing = (
    await db
      .select({ id: DiscoverListings.id, slug: DiscoverListings.slug })
      .from(DiscoverListings)
      .where(eq(DiscoverListings.sourceId, plan.sourceId))
      .limit(1)
  )[0];

  if (existing) {
    console.log(`  ${apply ? 'UPDATE' : 'would update'}  ${existing.slug} — ${plan.title} (${plan.steps.length} steps)`);
    if (apply) {
      await db
        .update(DiscoverListings)
        .set({ title: plan.title, description: plan.description, category: plan.category, payload, preview, updatedAt: now })
        .where(eq(DiscoverListings.id, existing.id));
    }
  } else {
    console.log(
      `  ${apply ? 'CREATE' : 'would create'}  ${submitOnly ? '(review queue)' : plan.slug} — ${plan.title} (${plan.steps.length} steps)`,
    );
    if (apply && submitOnly) {
      await db.insert(DiscoverListings).values({
        id: `dsc_${crypto.randomUUID()}`,
        kind: 'pack',
        sourceId: plan.sourceId,
        submittedByUserId: authorId,
        authorDisplayName: null,
        title: plan.title,
        description: plan.description,
        category: plan.category,
        payload,
        preview,
        status: 'submitted',
        installCount: 0,
        createdAt: now,
        updatedAt: now,
      });
    } else if (apply) {
      await db.insert(DiscoverListings).values({
        id: `dsc_${crypto.randomUUID()}`,
        kind: 'pack',
        sourceId: plan.sourceId,
        submittedByUserId: authorId,
        authorDisplayName: null,
        title: plan.title,
        description: plan.description,
        category: plan.category,
        slug: plan.slug,
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
  console.log(apply ? 'Applied.' : 'Dry run: pass --apply to write.');
}

if (process.argv[1]?.endsWith('discover-publish-plan.ts')) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
