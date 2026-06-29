export const FOUNDER_EMAIL = 'derek@harvous.com';

export const FEEDBACK_TOPICS = ['Bug', 'Idea', 'Question'] as const;
export type FeedbackTopic = (typeof FEEDBACK_TOPICS)[number];

export function isFeedbackTopic(value: string): value is FeedbackTopic {
  return (FEEDBACK_TOPICS as readonly string[]).includes(value);
}

export interface FeedbackMailtoProfile {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}

export interface BuildFeedbackMailtoOptions {
  message: string;
  topic?: FeedbackTopic;
  profile?: FeedbackMailtoProfile;
  version?: string;
  pageUrl?: string;
}

function feedbackSubject(topic?: FeedbackTopic): string {
  if (!topic) return 'Harvous feedback';
  return `Harvous feedback — ${topic}`;
}

function formatUserName(profile?: FeedbackMailtoProfile): string | null {
  if (!profile) return null;
  const first = profile.firstName?.trim() ?? '';
  const last = profile.lastName?.trim() ?? '';
  const full = `${first} ${last}`.trim();
  return full || null;
}

function buildFeedbackBody(
  message: string,
  profile?: FeedbackMailtoProfile,
  version?: string,
  pageUrl?: string,
): string {
  const trimmed = message.trim();
  const lines: string[] = [trimmed, '', '---'];

  const name = formatUserName(profile);
  const email = profile?.email?.trim();
  if (name) lines.push(`From: ${name}`);
  if (email) lines.push(`Reply-to: ${email}`);
  if (version) lines.push(`App version: ${version}`);
  if (pageUrl) lines.push(`Page: ${pageUrl}`);

  return lines.join('\n');
}

/** Build a mailto URL for founder feedback with prefilled subject and body. */
export function buildFeedbackMailto(options: BuildFeedbackMailtoOptions): string {
  const { message, topic, profile, version, pageUrl } = options;
  const subject = feedbackSubject(topic);
  const body = buildFeedbackBody(message, profile, version, pageUrl);
  const params = new URLSearchParams({
    subject,
    body,
  });
  return `mailto:${FOUNDER_EMAIL}?${params.toString()}`;
}

/** mailto link with subject only (no body). */
export function buildFounderMailto(subject = 'Harvous support'): string {
  return `mailto:${FOUNDER_EMAIL}?subject=${encodeURIComponent(subject)}`;
}

export interface BuildTicketReplyMailtoOptions {
  ticketNumber: number | null;
  ticketId: string;
  userEmail: string;
  topic?: FeedbackTopic | null;
  originalMessage: string;
}

function ticketReplySubject(topic: FeedbackTopic | null | undefined, ticketRef: string): string {
  const base = topic ? `Harvous feedback — ${topic}` : 'Harvous feedback';
  const ref = ticketRef ? ` [#${ticketRef}]` : '';
  return `Re: ${base}${ref}`;
}

/** Build a mailto URL for admin to reply to a support ticket submitter. */
export function buildTicketReplyMailto(options: BuildTicketReplyMailtoOptions): string {
  const { ticketNumber, ticketId, userEmail, topic, originalMessage } = options;
  const ticketRef = ticketNumber != null ? String(ticketNumber) : ticketId;
  const subject = ticketReplySubject(topic, ticketRef);
  const body = [
    '',
    '---',
    'Original message:',
    originalMessage.trim(),
    '',
    `Ticket: #${ticketRef}`,
  ].join('\n');
  const params = new URLSearchParams({ subject, body });
  return `mailto:${userEmail}?${params.toString()}`;
}
