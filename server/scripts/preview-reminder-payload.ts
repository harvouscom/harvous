/**
 * Print the reminders exactly as they will arrive, without sending anything.
 *
 * Notification copy is the one part of this feature that cannot be reviewed by reading the
 * code: the body is assembled from a verse fetched at send time, trimmed to a length only the
 * lock screen enforces. This renders the real payload from the real data so the wording can
 * be judged before anyone's phone shows it.
 *
 * Read-only — it opens no write path and records no delivery.
 *
 *   npm run push:preview                     # today, three zones, no account
 *   npm run push:preview -- --user <clerkId> # as that account sees it
 *   npm run push:preview -- --at 2026-12-25T13:00:00Z
 */
import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { buildReminderPayload, type ReminderKind } from '../utils/reminder-payload';
import { localPartsFor } from '../utils/push-reminders';
import { resolveVotdForLocalDate } from '../utils/votd-today-public';

/** A spread of zones that between them exercise the VOTD fallback: UTC+14 leads the publish. */
const SAMPLE_ZONES = ['America/Chicago', 'Europe/London', 'Pacific/Kiritimati'];

function readFlag(argv: readonly string[], name: string): string | null {
  const index = argv.indexOf(name);
  return index >= 0 ? (argv[index + 1] ?? null) : null;
}

export async function runPreviewReminderPayload(argv: readonly string[]): Promise<void> {
  const atRaw = readFlag(argv, '--at');
  const now = atRaw ? new Date(atRaw) : new Date();
  if (Number.isNaN(now.getTime())) throw new Error(`Unreadable --at value: ${atRaw}`);
  // No account given means no stored metadata, which is the "plain" fallback — the least
  // interesting reminder, and the one worth seeing precisely because it is the floor.
  const userId = readFlag(argv, '--user') ?? 'preview-no-such-user';

  console.log(`\nVerse of the day at ${now.toISOString()}\n`);
  for (const zone of SAMPLE_ZONES) {
    const parts = localPartsFor(zone, now);
    const votd = await resolveVotdForLocalDate(parts.localDate, 'push:preview');
    console.log(
      `  ${zone.padEnd(20)} ${parts.localDate}  ${String(parts.hour).padStart(2, '0')}:00  ` +
        `${votd ? `${votd.reference} (${votd.translation})` : 'nothing published'}`,
    );
  }

  console.log(`\nReminders for ${userId}\n`);
  for (const kind of ['sunday', 'midweek', 'test'] as ReminderKind[]) {
    const built = await buildReminderPayload(userId, { kind, now });
    const { payload } = built;
    console.log(`  ${kind}  ·  variant ${built.variant}`);
    console.log(`    ${payload.title}`);
    console.log(`    ${payload.body}`);
    console.log(`    ${payload.body.length} chars · opens ${payload.data.url}\n`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runPreviewReminderPayload(process.argv.slice(2))
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('[push:preview] failed:', error instanceof Error ? error.message : error);
      process.exit(1);
    });
}
