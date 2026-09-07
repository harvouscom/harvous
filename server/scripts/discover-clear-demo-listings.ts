/**
 * Empty the catalog before it is reachable by anyone real.
 *
 * Every row in it was written during the feature's own build, to click through
 * each kind and each treatment before anything had been submitted for real.
 * Five carry invented authors ("Sam W.", "Ada K.", "Jo M.", "Tom B.",
 * "Naomi R.") under sentinel `user_demo_*` ids; the rest are honestly
 * attributed to the account that made them but are placeholders all the same.
 * None of it came from a submit → review → approve flow with an actual
 * stranger, which is the only thing the catalog is for.
 *
 * That was fine while Discover was reachable only from a dev session. It stops
 * being fine the moment the app's Library-panel entry point ships to
 * production, because then a real signed-in person can browse this and install
 * somebody who does not exist.
 *
 * Deletes `DiscoverInstalls` first (the dependent side) and `DiscoverListings`
 * second. **Installed copies are not touched** — a template someone already
 * took is theirs, and lives in `NoteTemplates`, not here; that is the same
 * guarantee delisting has always made. Dry by default; `--apply` writes, and
 * `--production` on top of it when the target is the live database.
 */
import 'dotenv/config';
import { db, DiscoverListings, DiscoverInstalls } from '../db';
import { requireDbTarget } from '../utils/require-db-target';

async function main() {
  const argv = process.argv.slice(2);
  const apply = argv.includes('--apply');
  requireDbTarget({ scriptName: 'discover:clear', writes: apply, argv, env: process.env });

  const rows = await db
    .select({
      id: DiscoverListings.id,
      slug: DiscoverListings.slug,
      kind: DiscoverListings.kind,
      title: DiscoverListings.title,
      authorDisplayName: DiscoverListings.authorDisplayName,
      status: DiscoverListings.status,
    })
    .from(DiscoverListings);

  const installs = await db.select({ id: DiscoverInstalls.id }).from(DiscoverInstalls);

  if (rows.length === 0 && installs.length === 0) {
    console.log('Catalog is already empty. Nothing to do.');
    return;
  }

  for (const row of rows) {
    console.log(
      `  ${apply ? 'DELETE' : 'would delete'}  ${String(row.kind).padEnd(9)} ` +
        `${String(row.slug ?? row.id).padEnd(30)} ${String(row.status).padEnd(10)} ` +
        `"${row.title}" — ${row.authorDisplayName}`,
    );
  }

  console.log(
    `\n${rows.length} listing(s) and ${installs.length} install row(s)` +
      (apply ? ' deleted.' : ' would be deleted. Dry run: pass --apply to write.'),
  );

  if (apply) {
    await db.delete(DiscoverInstalls);
    await db.delete(DiscoverListings);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
