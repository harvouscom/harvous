/**
 * Put a plan folder into one person's Home as a private study plan, exactly as
 * a Discover install would land it, so the author can read it in Harvous
 * before the listing is approved.
 *
 * Uses the same `preparePackInstall` / `writeInstall` path as
 * `POST /api/discover/install`, from the same payload `discover-publish-plan`
 * builds, so what you read is what an installer gets. It writes no
 * `DiscoverInstalls` row: this is a preview, not an install, and should not
 * count toward the listing or mark it "already yours". Nothing public changes.
 * Delete the Thread afterwards like any other.
 *
 * Usage (dry by default):
 *   npx tsx server/scripts/discover-preview-plan.ts docs/advent-2026-study-plan --user <userId>
 *   npx tsx server/scripts/discover-preview-plan.ts docs/advent-2026-study-plan --user <userId> --apply [--production]
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { db } from '../db';
import { requireDbTarget } from '../utils/require-db-target';
import { preparePackInstall, writeInstall, runInstallPostCommit } from '../utils/discover-install';
import type { PackPayload } from '../utils/discover-snapshot';
import { buildPlanListing, type PlanFile } from './discover-publish-plan';

async function main() {
  const argv = process.argv.slice(2);
  const folder = argv.find((a, i) => !a.startsWith('--') && argv[i - 1] !== '--user');
  const userId = argv[argv.indexOf('--user') + 1];
  if (!folder || !argv.includes('--user') || !userId) {
    throw new Error('Usage: discover-preview-plan.ts <plan folder> --user <userId> [--apply]');
  }
  const apply = argv.includes('--apply');
  requireDbTarget({ scriptName: 'discover:preview-plan', writes: apply, argv, env: process.env });

  const dir = resolve(process.cwd(), folder);
  const plan = JSON.parse(readFileSync(resolve(dir, 'plan.json'), 'utf-8')) as PlanFile;
  const bodies = plan.steps.map((s) => readFileSync(resolve(dir, 'notes', s.contentFile), 'utf-8').trim());
  const { payload } = buildPlanListing(plan, bodies, process.env.HARVOUS_SYSTEM_USER_ID ?? 'harvous');

  console.log(`  ${apply ? 'ADD' : 'would add'}  "${plan.thread.title}" (${plan.steps.length} steps) to ${userId}'s Home`);
  if (!apply) {
    console.log('Dry run: pass --apply to write.');
    return;
  }
  const prepared = await preparePackInstall(JSON.parse(payload) as PackPayload, null, userId);
  await db.transaction(async (tx) => {
    await writeInstall(tx, prepared, userId);
  });
  const warnings = await runInstallPostCommit(prepared, userId);
  console.log(`Added thread ${prepared.primaryRefId}.`, warnings?.length ? `Warnings: ${JSON.stringify(warnings)}` : '');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
