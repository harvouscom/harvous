/**
 * Prepare the parent email for a child privacy notice change (COPPA §312.4(b)). Runbook:
 * docs/CHILD_NOTEBOOKS_LAUNCH.md, "Any change to what's collected or shared".
 *
 * Run it after the release that bumps CHILD_NOTICE_VERSION is live, so every notebook it lists is
 * already paused and the renewal screen is there when the parent arrives.
 *
 * It reads FamilyChildren and each parent's verified primary email from Clerk, and never writes to
 * the database. With --send it sends one email per parent through Cloudflare Email Sending, from
 * derek@harvous.com (server/family/cloudflare-email.ts). Without it, nothing is sent, and the folder
 * it writes is the fallback: send those emails yourself, one per parent.
 *
 * Usage (needs the API's Supabase env and CLERK_SECRET_KEY):
 *   npx tsx server/scripts/child-notice-change-email.ts --changes=changes.txt
 *       Counts only. Prints the email with no addresses.
 *   npx tsx server/scripts/child-notice-change-email.ts --changes=changes.txt --out=~/Desktop/notice-2026-12
 *       Writes recipients.csv plus the email (text and HTML) for one notebook and for several.
 *   ... --out=~/Desktop/notice-2026-12 --test-to=derek@harvous.com
 *       Sends both versions (one notebook, several) to that address only, marked [Test]. Do this first.
 *   ... --out=~/Desktop/notice-2026-12 --send
 *       Same, then asks you to type "send" and sends. Needs CLOUDFLARE_ACCOUNT_ID and
 *       CLOUDFLARE_EMAIL_API_TOKEN. Each result goes into sent.csv in the folder; running it again
 *       skips everyone already sent, so after a failure fix the cause and re-run.
 *
 * changes.txt: one change per line, written for a parent ("We now keep ... so that ..."). Blank lines
 * and a leading "- " are ignored.
 *
 * --out must be outside this checkout: recipients.csv and sent.csv hold parent email addresses. Keep
 * sent.csv as the record that each parent was sent the notice (when, and Cloudflare's message ID);
 * delete the rest once everyone has it.
 */
import 'dotenv/config';
import { createClerkClient } from '@clerk/backend';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { homedir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { familyPublicConfig } from '../family/config';
import { CHILD_NOTICE_VERSION } from '../family/policy';
import { noticeChangeEmail, noticeChangeRecipients } from '../family/notice-change-email';
import { cloudflareEmailConfig, sendCloudflareEmail, type OutgoingEmail, type SendResult } from '../family/cloudflare-email';
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

export interface NoticeRecipient { email: string; notebookCount: number }

/**
 * Sends to each recipient not already marked sent in sentLog, one at a time, appending every result.
 * Stops at the first failure that would fail for everyone (bad token, throttled, Cloudflare down);
 * a bounce for one address is logged and the rest carry on.
 */
export async function sendNotices(recipients: readonly NoticeRecipient[], emailFor: (r: NoticeRecipient) => Omit<OutgoingEmail, 'to'>,
  sentLog: string, send: (email: OutgoingEmail) => Promise<SendResult>, now = () => new Date()) {
  const already = new Set(existsSync(sentLog)
    ? readFileSync(sentLog, 'utf8').split('\n').slice(1).map((line) => line.split(',')).filter((c) => c[2] === 'sent').map((c) => c[0])
    : []);
  if (!existsSync(sentLog)) writeFileSync(sentLog, 'email,at,status,detail\n', { mode: 0o600 });
  const tally = { sent: 0, skipped: 0, failed: 0, stopped: false };
  for (const r of recipients) {
    if (already.has(r.email)) { tally.skipped++; continue; }
    const result = await send({ to: r.email, ...emailFor(r) });
    const row = result.ok ? [r.email, now().toISOString(), 'sent', result.messageId + (result.queued ? ' (queued)' : '')]
      : [r.email, now().toISOString(), 'failed', result.code];
    appendFileSync(sentLog, row.map(csvCell).join(',') + '\n');
    if (result.ok) { tally.sent++; continue; }
    tally.failed++;
    if (result.retryable || result.status === 401 || result.status === 403) { tally.stopped = true; break; }
  }
  return tally;
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

  const sending = argv.includes('--send');
  const cloudflare = cloudflareEmailConfig(env);
  if (sending && !cloudflare) throw new Error('--send needs CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_EMAIL_API_TOKEN.');

  const clerk = createClerkClient({ secretKey: env.CLERK_SECRET_KEY! });
  const rows: string[] = ['email,notebooks,variant'];
  const resolved: NoticeRecipient[] = [];
  const missing: string[] = [];
  for (const r of recipients) {
    const user = await clerk.users.getUser(r.parentUserId).catch(() => null);
    const email = user?.emailAddresses.find((e) => e.id === user.primaryEmailAddressId && e.verification?.status === 'verified')?.emailAddress;
    if (!email) { missing.push(r.parentUserId); continue; }
    resolved.push({ email, notebookCount: r.notebookCount });
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

  const testTo = arg(argv, 'test-to');
  if (testTo) {
    // One copy of each version to yourself, to check Cloudflare accepts it and how it looks. Not logged in sent.csv.
    if (!cloudflare) throw new Error('--test-to needs CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_EMAIL_API_TOKEN.');
    for (const email of [one, several]) {
      const result = await sendCloudflareEmail(cloudflare, { to: testTo, subject: `[Test] ${email.subject}`, html: email.html, text: email.text });
      console.log(result.ok ? `Test sent to ${testTo} (${result.messageId}).` : `Test failed: ${result.code} (HTTP ${result.status}).`);
    }
    return;
  }
  if (!sending || resolved.length === 0) return;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`\nSend the notice to ${resolved.length} parent(s) from derek@harvous.com? Type "send" to go ahead: `);
  rl.close();
  if (answer.trim() !== 'send') { console.log('Nothing sent.'); return; }
  const tally = await sendNotices(resolved, (r) => r.notebookCount > 1 ? several : one, join(outDir, 'sent.csv'),
    (email) => sendCloudflareEmail(cloudflare!, email));
  console.log(`\nSent ${tally.sent}, already sent before ${tally.skipped}, failed ${tally.failed}. Details in sent.csv.`);
  if (tally.stopped) console.warn('Stopped early: the last failure would hit everyone. Fix it, then run the same command again; it skips anyone already sent.');
  else if (tally.failed) console.warn('Some addresses bounced or are suppressed. Reach those parents another way, using the files in the folder.');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  run(process.argv.slice(2)).then(() => process.exit(0), (error) => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
}
