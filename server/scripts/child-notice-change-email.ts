/**
 * Prepare the parent email for a child privacy notice change (COPPA §312.4(b)). Runbook:
 * docs/CHILD_NOTEBOOKS_LAUNCH.md, "Any change to what's collected or shared".
 *
 * Run it after the release that bumps CHILD_NOTICE_VERSION is live, so every notebook it lists is
 * already paused and the renewal screen is there when the parent arrives.
 *
 * Read-only: it reads FamilyChildren and each parent's verified primary email from Clerk, and sends
 * nothing. Harvous has no transactional sender, so Derek sends the result from his own mailbox, one
 * email per parent (not one email with everyone in To or CC).
 *
 * Usage (needs the API's Supabase env and CLERK_SECRET_KEY):
 *   npx tsx server/scripts/child-notice-change-email.ts --changes=changes.txt
 *       Counts only. Prints the email with no addresses.
 *   npx tsx server/scripts/child-notice-change-email.ts --changes=changes.txt --out=~/Desktop/notice-2026-12
 *       Writes recipients.csv plus the email (text and HTML) for one notebook and for several.
 *
 * changes.txt: one change per line, written for a parent ("We now keep ... so that ..."). Blank lines
 * and a leading "- " are ignored.
 *
 * --out must be outside this checkout: recipients.csv holds parent email addresses. Delete the folder
 * once the emails are sent; your sent mail is the record of the notice.
 */
import 'dotenv/config';
import { createClerkClient } from '@clerk/backend';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { familyPublicConfig } from '../family/config';
import { CHILD_NOTICE_VERSION } from '../family/policy';
import { noticeChangeEmail, noticeChangeRecipients } from '../family/notice-change-email';
import { requireDbTarget } from '../utils/require-db-target';

const arg = (argv: readonly string[], name: string) => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);

export function parseChanges(raw: string) {
  return raw.split('\n').map((line) => line.trim().replace(/^[-*]\s+/, '')).filter(Boolean);
}

/** Where the parent lands: sign-in, then child notebooks. Same redirect the child-return hop uses. */
export function renewUrlFor(env: NodeJS.ProcessEnv) {
  const url = new URL('/settings/child-accounts', env.HARVOUS_PARENT_APP_URL ?? 'https://app.harvous.com');
  return url.href;
}

const csvCell = (value: string | number) => /[",\n]/.test(String(value)) ? `"${String(value).replace(/"/g, '""')}"` : String(value);

export async function run(argv: readonly string[], env = process.env) {
  const changesPath = arg(argv, 'changes');
  if (!changesPath) throw new Error('--changes=<file> is required: the email has to say what changed.');
  const changes = parseChanges(readFileSync(changesPath, 'utf8'));
  const config = familyPublicConfig(env);
  if (!config) throw new Error('Child notebook URLs are not configured (HARVOUS_CHILD_APP_URL, HARVOUS_CHILD_PRIVACY_URL).');
  const base = { changes, renewUrl: renewUrlFor(env), privacyUrl: config.privacyUrl, noticeVersion: CHILD_NOTICE_VERSION };
  const one = noticeChangeEmail({ ...base, notebookCount: 1 });
  const several = noticeChangeEmail({ ...base, notebookCount: 2 });

  const rawOut = arg(argv, 'out');
  const outDir = rawOut ? resolve(rawOut.replace(/^~(?=\/|$)/, homedir())) : undefined;
  if (outDir && !relative(process.cwd(), outDir).startsWith('..')) {
    throw new Error('--out must be outside this checkout. recipients.csv holds parent email addresses.');
  }

  requireDbTarget({ scriptName: 'child-notice-change-email', writes: false, argv, env });
  const { db } = await import('../db/client');
  const recipients = await noticeChangeRecipients(db);
  console.log(`\nNotice ${CHILD_NOTICE_VERSION}: ${recipients.length} parent(s) with paused notebooks, ` +
    `${recipients.reduce((n, r) => n + r.notebookCount, 0)} notebook(s).`);

  if (!outDir) {
    console.log(`\nSubject: ${one.subject}\n\n${one.text}`);
    if (recipients.length) console.log('Add --out=<folder outside this checkout> to write the recipient list.');
    return;
  }

  const clerk = createClerkClient({ secretKey: env.CLERK_SECRET_KEY! });
  const rows: string[] = ['email,notebooks,variant'];
  const missing: string[] = [];
  for (const r of recipients) {
    const user = await clerk.users.getUser(r.parentUserId).catch(() => null);
    const email = user?.emailAddresses.find((e) => e.id === user.primaryEmailAddressId && e.verification?.status === 'verified')?.emailAddress;
    if (!email) { missing.push(r.parentUserId); continue; }
    rows.push([email, r.notebookCount, r.notebookCount > 1 ? 'several' : 'one'].map(csvCell).join(','));
  }

  mkdirSync(outDir, { recursive: true, mode: 0o700 });
  writeFileSync(join(outDir, 'recipients.csv'), rows.join('\n') + '\n', { mode: 0o600 });
  for (const [name, email] of [['one', one], ['several', several]] as const) {
    writeFileSync(join(outDir, `email-${name}.txt`), `Subject: ${email.subject}\n\n${email.text}`);
    writeFileSync(join(outDir, `email-${name}.html`), email.html);
  }
  console.log(`Wrote ${rows.length - 1} recipient(s) and the email to ${outDir}`);
  if (missing.length) {
    console.warn(`\n${missing.length} parent(s) have no verified primary email in Clerk. Reach them another way and note how:`);
    for (const id of missing) console.warn(`  ${id}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  run(process.argv.slice(2)).then(() => process.exit(0), (error) => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
}
