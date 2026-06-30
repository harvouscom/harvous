/**
 * Create and validate user support tickets from the settings support form.
 */

import { db, first, SupportTickets, UserMetadata, eq, max } from '../db';
import { nowISO } from '../db/dates';
import { isFeedbackTopic, type FeedbackTopic } from '@/utils/support-mailto';
import { formatSupportTicketRef } from '@/utils/support-tickets';
import { isSupportTicketsTableMissing } from './pg-undefined-relation';

const MAX_MESSAGE_LENGTH = 5000;
const MAX_CLIENT_ENV_LENGTH = 400;

export type SupportTicketStatus = 'open' | 'closed';

export type CreateSupportTicketInput = {
  topic?: FeedbackTopic | null;
  message: string;
  appVersion?: string | null;
  pageUrl?: string | null;
  clientEnvironment?: string | null;
};

export function isSupportTicketStatus(value: string): value is SupportTicketStatus {
  return value === 'open' || value === 'closed';
}

export { formatSupportTicketRef };

export function validateCreateSupportTicketInput(body: unknown): CreateSupportTicketInput | null {
  if (!body || typeof body !== 'object') return null;
  const { topic, message, appVersion, pageUrl, clientEnvironment } = body as Record<string, unknown>;

  if (typeof message !== 'string') return null;
  const trimmedMessage = message.trim();
  if (!trimmedMessage || trimmedMessage.length > MAX_MESSAGE_LENGTH) return null;

  if (topic != null && topic !== '') {
    if (typeof topic !== 'string' || !isFeedbackTopic(topic)) return null;
  }

  const trimmedVersion = typeof appVersion === 'string' ? appVersion.trim() : '';
  const trimmedPageUrl = typeof pageUrl === 'string' ? pageUrl.trim() : '';
  const trimmedClientEnv =
    typeof clientEnvironment === 'string' ? clientEnvironment.trim().slice(0, MAX_CLIENT_ENV_LENGTH) : '';

  return {
    topic: typeof topic === 'string' && isFeedbackTopic(topic) ? topic : null,
    message: trimmedMessage,
    appVersion: trimmedVersion || null,
    pageUrl: trimmedPageUrl || null,
    clientEnvironment: trimmedClientEnv || null,
  };
}

function formatUserName(firstName?: string | null, lastName?: string | null): string | null {
  const first = firstName?.trim() ?? '';
  const last = lastName?.trim() ?? '';
  const full = `${first} ${last}`.trim();
  return full || null;
}

async function allocateNextTicketNumber(): Promise<number> {
  const result = await db.select({ value: max(SupportTickets.ticketNumber) }).from(SupportTickets);
  return Number(result[0]?.value ?? 0) + 1;
}

export async function createSupportTicket(
  userId: string,
  input: CreateSupportTicketInput,
): Promise<{ id: string; ticketNumber: number; createdAt: string } | null> {
  try {
    const meta = first(
      await db
        .select({
          firstName: UserMetadata.firstName,
          lastName: UserMetadata.lastName,
          email: UserMetadata.email,
        })
        .from(UserMetadata)
        .where(eq(UserMetadata.userId, userId))
        .limit(1),
    );

    const createdAt = nowISO();
    const ticketNumber = await allocateNextTicketNumber();
    const id = String(ticketNumber);

    await db.insert(SupportTickets).values({
      id,
      ticketNumber,
      userId,
      topic: input.topic ?? null,
      message: input.message,
      userEmail: meta?.email?.trim() || null,
      userName: formatUserName(meta?.firstName, meta?.lastName),
      appVersion: input.appVersion ?? null,
      pageUrl: input.pageUrl ?? null,
      clientEnvironment: input.clientEnvironment ?? null,
      status: 'open',
      adminNote: null,
      createdAt,
      closedAt: null,
    });

    return { id, ticketNumber, createdAt };
  } catch (error) {
    if (isSupportTicketsTableMissing(error)) {
      console.warn('[createSupportTicket] SupportTickets table missing; skipping. Run `npm run db:push`.');
      return null;
    }
    throw error;
  }
}
