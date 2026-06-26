export const FOUNDER_EMAIL = 'derek@harvous.com';

export type FeedbackTopic = 'Bug' | 'Idea' | 'Question';

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
