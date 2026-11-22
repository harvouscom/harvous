/**
 * The email a parent gets when the child privacy notice changes (COPPA §312.4(b): direct notice of
 * a material change to practices the parent already agreed to).
 *
 * Bumping CHILD_NOTICE_VERSION pauses every notebook agreed under an older notice
 * (hasActiveChildConsent). The parent learns why here, and renews on the notebook's page in My
 * Family. The email itself asks for nothing: consent is only ever given in the app, with the full
 * notice and the guardian confirmation.
 *
 * Deliberately left out of the email: the child's name or nickname, and anything from the notebook.
 * Whatever carries the email (a mailbox, a provider) then never holds child information. The
 * parent sees each notebook by name once they sign in.
 *
 * Pure. Recipients come from `noticeChangeRecipients`; the script in
 * server/scripts/child-notice-change-email.ts puts the two together.
 */
import { and, eq, ne } from 'drizzle-orm';
import { FamilyChildren } from '../db/schema';
import { CHILD_NOTICE_VERSION } from './policy';
import type { FamilyTx } from './service';

/** Who to contact, as the published children's policy lists it. Keep in step with harvous.com. */
export const CHILD_PRIVACY_CONTACT = Object.freeze({
  operator: 'Testament Made LLC',
  email: 'derek@harvous.com',
  phone: '515-802-1628',
  mail: '2190 SE Tahoe Ln, Waukee, IA 50263'
});

export interface NoticeChangeEmailInput {
  /** Plain sentences, one per change, written for a parent. Required: the email exists to say what changed. */
  changes: readonly string[];
  /** How many paused notebooks this parent manages. Only changes "notebook" to "notebooks". */
  notebookCount: number;
  /** Where the parent signs in and lands on child notebooks, e.g. https://app.harvous.com/settings/child-accounts */
  renewUrl: string;
  /** The published Children's Privacy Policy. */
  privacyUrl: string;
  noticeVersion?: string;
}

export interface NoticeChangeEmail { subject: string; text: string; html: string }

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (ch) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);

export function noticeChangeEmail(input: NoticeChangeEmailInput): NoticeChangeEmail {
  const changes = input.changes.map((c) => c.trim()).filter(Boolean);
  if (changes.length === 0) throw new Error('List at least one change. The email has to say what changed.');
  if (!Number.isInteger(input.notebookCount) || input.notebookCount < 1) throw new Error('notebookCount must be 1 or more.');
  for (const url of [input.renewUrl, input.privacyUrl]) {
    if (new URL(url).protocol !== 'https:') throw new Error(`Links in the email must be https: ${url}`);
  }
  const many = input.notebookCount > 1;
  const notebook = many ? `your child notebooks are` : `your child's notebook is`;
  const it = many ? 'them' : 'it';
  const version = input.noticeVersion ?? CHILD_NOTICE_VERSION;
  const contact = CHILD_PRIVACY_CONTACT;

  const subject = 'We updated our children\'s privacy notice. Please review it.';

  // One list of paragraphs, rendered twice, so the text and HTML parts can't drift apart.
  type Block = { p: string } | { list: string[] } | { steps: string[] };
  const blocks: Block[] = [
    { p: 'Hi,' },
    { p: `We've changed what Harvous collects from children, how we use it, or who we share it with. You agreed to our earlier notice, so ${notebook} paused until you read the new one and decide.` },
    { p: 'Here is what changed:' },
    { list: changes },
    { p: `While ${it} ${many ? 'are' : 'is'} paused, your child can't open ${it} and we don't collect anything new. Nothing has been deleted.` },
    { p: 'To read the new notice and agree:' },
    { steps: [
      `Sign in at ${input.renewUrl}`,
      `Open the notebook in My Family.`,
      `Read the updated notice, check the box, and select "Agree and resume notebook".`
    ] },
    { p: `If you don't agree, you don't need to do anything. The notebook stays paused. From the same page you can still see and export everything in ${it}, withdraw your consent, or delete ${it}. A notebook nobody uses for a year is deleted, as our policy says.` },
    { p: `Our full Children's Privacy Policy: ${input.privacyUrl}` },
    { p: `Questions? Reply to this email, write to ${contact.email}, call ${contact.phone}, or write to ${contact.operator}, ${contact.mail}.` },
    { p: 'Derek\nHarvous' },
    { p: `You're getting this because you manage a child notebook in Harvous. It's a required notice, not marketing. (Notice version ${version})` }
  ];

  const text = blocks.map((b) => 'p' in b ? b.p
    : 'list' in b ? b.list.map((l) => `- ${l}`).join('\n')
    : b.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')).join('\n\n') + '\n';

  const linkify = (value: string) => escapeHtml(value).replace(/https:\/\/[^\s<]+/g, (url) => `<a href="${url}">${url}</a>`);
  const html = [
    '<!doctype html><html><body style="font-family: -apple-system, system-ui, sans-serif; font-size: 16px; line-height: 1.5; color: #1a1a1a; max-width: 560px;">',
    ...blocks.map((b) => 'p' in b ? `<p>${linkify(b.p).replace(/\n/g, '<br>')}</p>`
      : 'list' in b ? `<ul>${b.list.map((l) => `<li>${linkify(l)}</li>`).join('')}</ul>`
      : `<ol>${b.steps.map((s) => `<li>${linkify(s)}</li>`).join('')}</ol>`),
    '</body></html>'
  ].join('\n');

  return { subject, text, html };
}

/**
 * Parents who owe a renewal: at least one active notebook agreed under an older notice. Withdrawn
 * notebooks are left out, since they can never resume (the renewal route refuses them).
 */
export async function noticeChangeRecipients(tx: Pick<FamilyTx, 'select'>, noticeVersion = CHILD_NOTICE_VERSION) {
  const rows = await tx.select({ parentUserId: FamilyChildren.parentUserId }).from(FamilyChildren)
    .where(and(eq(FamilyChildren.status, 'active'), ne(FamilyChildren.noticeVersion, noticeVersion)));
  const counts = new Map<string, number>();
  for (const { parentUserId } of rows) counts.set(parentUserId, (counts.get(parentUserId) ?? 0) + 1);
  return [...counts].map(([parentUserId, notebookCount]) => ({ parentUserId, notebookCount }));
}
