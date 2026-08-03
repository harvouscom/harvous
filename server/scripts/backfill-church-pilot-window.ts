/**
 * One-time backfill: give every already-registered church a pilot window.
 *
 * Church-scoped writes now require sponsorship (see church-entitlement.ts):
 * `billingPlan` set, or `pilotUntil` in the future. Churches registered before
 * those columns existed have both null, so without this backfill they read as
 * lapsed the moment the gate ships and their staff lose the ability to create
 * ministry channels — a silent regression on live pilot churches.
 *
 * Only touches rows that are active, unpaid, and have no pilot window. Never
 * shortens an existing window and never touches a paying church.
 *
 * Dry run:  npx tsx server/scripts/backfill-church-pilot-window.ts
 * Apply:    npx tsx server/scripts/backfill-church-pilot-window.ts --apply
 * Custom:   ... --apply --days=60
 */

import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { db, Churches, and, eq, isNull } from '../db';

const DEFAULT_PILOT_DAYS = 30;

export function pilotUntilFromNow(days: number, now: Date = new Date()): Date {
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
}

async function main() {
  const apply = process.argv.includes('--apply');
  const daysArg = process.argv.find((arg) => arg.startsWith('--days='));
  const days = daysArg ? Number(daysArg.split('=')[1]) : DEFAULT_PILOT_DAYS;

  if (!Number.isFinite(days) || days <= 0) {
    console.error(`Invalid --days value: ${daysArg}`);
    process.exit(1);
  }

  const candidates = await db
    .select({ id: Churches.id, name: Churches.name, orgId: Churches.orgId })
    .from(Churches)
    .where(
      and(
        eq(Churches.isActive, true),
        isNull(Churches.deletedAt),
        isNull(Churches.billingPlan),
        isNull(Churches.pilotUntil),
      ),
    );

  const pilotUntil = pilotUntilFromNow(days);

  if (candidates.length === 0) {
    console.log('No churches need a pilot window — nothing to do.');
    return;
  }

  console.log(
    `${apply ? 'Setting' : 'Would set'} pilotUntil=${pilotUntil.toISOString()} (${days} days) on ${candidates.length} church(es):`,
  );
  for (const church of candidates) {
    console.log(`  · ${church.name} (${church.id} / ${church.orgId})`);
  }

  if (!apply) {
    console.log('\nDry run — re-run with --apply to write.');
    return;
  }

  const now = new Date();
  for (const church of candidates) {
    await db
      .update(Churches)
      .set({ pilotUntil, updatedAt: now })
      .where(eq(Churches.id, church.id));
  }
  console.log(`\nUpdated ${candidates.length} church(es).`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('[backfill-church-pilot-window] failed:', error);
      process.exit(1);
    });
}
