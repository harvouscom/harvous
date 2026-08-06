/**
 * Fill `Churches.country` for rows that never got one.
 *
 * The column is nullable and was empty on every existing church, including
 * HMC-linked ones whose `state` made the answer obvious — 'IA' is 'US'. The
 * settings time-zone picker needs a country to shortlist zones, so an empty
 * column meant every church scrolled all 419.
 *
 * Uses the same `deriveChurchCountry` the create and update routes now use, so
 * a backfilled row is identical to one written today. Idempotent: rows that
 * already have a country, or whose region the mapper doesn't know, are left
 * exactly as they are.
 *
 *   npx tsx scripts/backfill-church-country.ts          # report only
 *   npx tsx scripts/backfill-church-country.ts --apply  # write
 *
 * If this fails with `EMAXCONNSESSION … pool_size: 15`, the Supabase pooler is
 * saturated rather than anything being wrong here: each dev server opens up to
 * 10 clients, so two running at once leaves nothing for a script. Stop one and
 * re-run. Both SUPABASE_DATABASE_URL and SUPABASE_DIRECT_URL go through the
 * pooler, so there is no direct-connection escape hatch to reach for.
 */
import 'dotenv/config';
import { db, Churches, eq, isNull } from '../server/db';
import { deriveChurchCountry } from '../server/utils/church-country';

async function main() {
  const apply = process.argv.includes('--apply');

  const rows = await db
    .select({
      id: Churches.id,
      name: Churches.name,
      state: Churches.state,
      country: Churches.country,
    })
    .from(Churches)
    .where(isNull(Churches.country));

  if (rows.length === 0) {
    console.log('Every church already has a country. Nothing to do.');
    return;
  }

  const fillable: { id: string; name: string; state: string | null; country: string }[] = [];
  const skipped: { name: string; state: string | null }[] = [];

  for (const row of rows) {
    const derived = deriveChurchCountry(row.country, row.state);
    if (derived) fillable.push({ ...row, country: derived });
    else skipped.push({ name: row.name, state: row.state });
  }

  console.log(`${rows.length} church(es) with no country.`);
  for (const row of fillable) {
    console.log(`  ${apply ? 'set ' : 'would set'} ${row.name}: state ${row.state} -> ${row.country}`);
  }
  for (const row of skipped) {
    // Not a failure: a region the HMC mapper doesn't cover has no honest
    // answer, and guessing one would be worse than leaving it null.
    console.log(`  skip ${row.name}: region ${row.state ?? '(none)'} is not mapped`);
  }

  if (!apply) {
    console.log('\nDry run. Re-run with --apply to write.');
    return;
  }

  for (const row of fillable) {
    await db
      .update(Churches)
      .set({ country: row.country, updatedAt: new Date() })
      .where(eq(Churches.id, row.id));
  }
  console.log(`\nUpdated ${fillable.length} church(es).`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
