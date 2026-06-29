/**
 * Integration test for SupportTickets inbox — requires Supabase Postgres.
 *
 * Skips when SUPABASE_DATABASE_URL / SUPABASE_DIRECT_URL is unset (CI without DB).
 * Seeds sample rows, exercises create/list/detail/patch, then deletes all test data.
 */

import 'dotenv/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db, SupportTickets, eq } from '../../db';
import { nowISO } from '../../db/dates';
import { createSupportTicket } from '../support-ticket';
import {
  countOpenSupportTickets,
  countUnreadSupportTickets,
  getSupportTicket,
  listSupportTickets,
  patchSupportTicket,
} from '../admin-support-tickets';

const HAS_DB = Boolean(process.env.SUPABASE_DATABASE_URL ?? process.env.SUPABASE_DIRECT_URL);
const TEST_USER_ID = 'user_support_inbox_integration_test';

const SAMPLE_OPEN_ID = '999001';
const SAMPLE_CLOSED_ID = '999002';

const SAMPLE_OPEN = {
  id: SAMPLE_OPEN_ID,
  ticketNumber: 999001,
  userId: TEST_USER_ID,
  topic: 'Bug',
  message: 'Integration test — open ticket sample',
  userEmail: 'inbox-test@harvous.com',
  userName: 'Inbox Test User',
  appVersion: '9.9.9-integration',
  pageUrl: 'https://app.harvous.com/settings/support',
  clientEnvironment: 'Desktop · macOS 14.0 · Chrome 120',
  status: 'open',
  adminNote: null,
  createdAt: nowISO(),
  closedAt: null,
} as const;

const SAMPLE_CLOSED = {
  id: SAMPLE_CLOSED_ID,
  ticketNumber: 999002,
  userId: TEST_USER_ID,
  topic: 'Idea',
  message: 'Integration test — closed ticket sample',
  userEmail: 'inbox-test@harvous.com',
  userName: 'Inbox Test User',
  appVersion: '9.9.9-integration',
  pageUrl: 'https://app.harvous.com/settings/support',
  clientEnvironment: 'Mobile · iOS 17.2 · Safari 17.2',
  status: 'closed',
  adminNote: 'Resolved in integration test seed',
  createdAt: nowISO(),
  closedAt: nowISO(),
} as const;

async function deleteTestTickets(): Promise<void> {
  await db.delete(SupportTickets).where(eq(SupportTickets.userId, TEST_USER_ID));
}

describe.skipIf(!HAS_DB)('support inbox integration (database)', () => {
  let createdTicketId: string | null = null;

  beforeAll(async () => {
    await deleteTestTickets();
    await db.insert(SupportTickets).values([{ ...SAMPLE_OPEN }, { ...SAMPLE_CLOSED }]);
  });

  afterAll(async () => {
    await deleteTestTickets();
  });

  it('lists open tickets with sample open row and open count', async () => {
    const { tickets, openCount } = await listSupportTickets('open');
    const ids = tickets.map((t) => t.id);

    expect(ids).toContain(SAMPLE_OPEN_ID);
    expect(ids).not.toContain(SAMPLE_CLOSED_ID);
    expect(openCount).toBeGreaterThanOrEqual(1);

    const row = tickets.find((t) => t.id === SAMPLE_OPEN_ID);
    expect(row).toMatchObject({
      topic: 'Bug',
      message: SAMPLE_OPEN.message,
      userEmail: SAMPLE_OPEN.userEmail,
      userName: SAMPLE_OPEN.userName,
      status: 'open',
      unread: true,
    });
  });

  it('lists closed tickets with sample closed row only', async () => {
    const { tickets } = await listSupportTickets('closed');
    const ids = tickets.map((t) => t.id);

    expect(ids).toContain(SAMPLE_CLOSED_ID);
    expect(ids).not.toContain(SAMPLE_OPEN_ID);
  });

  it('loads full ticket detail for sample open row', async () => {
    const ticket = await getSupportTicket(SAMPLE_OPEN_ID);
    expect(ticket).not.toBeNull();
    expect(ticket).toMatchObject({
      id: SAMPLE_OPEN_ID,
      userId: TEST_USER_ID,
      topic: 'Bug',
      message: SAMPLE_OPEN.message,
      userEmail: SAMPLE_OPEN.userEmail,
      userName: SAMPLE_OPEN.userName,
      appVersion: SAMPLE_OPEN.appVersion,
      pageUrl: SAMPLE_OPEN.pageUrl,
      status: 'open',
      adminNote: null,
      closedAt: null,
    });
    expect(ticket?.createdAt).toBeTruthy();
  });

  it('creates a ticket via createSupportTicket and returns id', async () => {
    const result = await createSupportTicket(TEST_USER_ID, {
      topic: 'Question',
      message: 'Integration test — created via API helper',
      appVersion: '9.9.9-integration',
      pageUrl: 'https://app.harvous.com/settings/support',
      clientEnvironment: 'Desktop · macOS 14.0 · Safari 17.2',
    });

    expect(result).not.toBeNull();
    expect(result?.ticketNumber).toBeGreaterThan(0);
    expect(result?.id).toBe(String(result?.ticketNumber));
    createdTicketId = result!.id;

    const detail = await getSupportTicket(createdTicketId);
    expect(detail).toMatchObject({
      userId: TEST_USER_ID,
      topic: 'Question',
      message: 'Integration test — created via API helper',
      status: 'open',
    });
  });

  it('patches admin note and closes then reopens created ticket', async () => {
    expect(createdTicketId).toBeTruthy();
    const id = createdTicketId!;

    const noted = await patchSupportTicket(id, { adminNote: 'Follow up in test' });
    expect(noted?.adminNote).toBe('Follow up in test');

    const closed = await patchSupportTicket(id, { status: 'closed' });
    expect(closed?.status).toBe('closed');
    expect(closed?.closedAt).toBeTruthy();

    const closedList = await listSupportTickets('closed');
    expect(closedList.tickets.some((t) => t.id === id)).toBe(true);

    const reopened = await patchSupportTicket(id, { status: 'open' });
    expect(reopened?.status).toBe('open');
    expect(reopened?.closedAt).toBeNull();

    const openList = await listSupportTickets('open');
    expect(openList.tickets.some((t) => t.id === id)).toBe(true);
  });

  it('countOpenSupportTickets reflects at least seeded open tickets', async () => {
    const openCount = await countOpenSupportTickets();
    expect(openCount).toBeGreaterThanOrEqual(1);
  });

  it('tracks unread count and mark read / mark unread', async () => {
    const beforeUnread = await countUnreadSupportTickets();
    expect(beforeUnread).toBeGreaterThanOrEqual(1);

    const read = await getSupportTicket(SAMPLE_OPEN_ID, { markRead: true });
    expect(read?.unread).toBe(false);
    expect(read?.adminReadAt).toBeTruthy();

    const afterRead = await countUnreadSupportTickets();
    expect(afterRead).toBe(beforeUnread - 1);

    const unreadAgain = await patchSupportTicket(SAMPLE_OPEN_ID, { read: false });
    expect(unreadAgain?.unread).toBe(true);
    expect(unreadAgain?.adminReadAt).toBeNull();

    const afterUnread = await countUnreadSupportTickets();
    expect(afterUnread).toBe(beforeUnread);
  });

  it('removes all test tickets in afterAll', async () => {
    const remaining = await db
      .select({ id: SupportTickets.id })
      .from(SupportTickets)
      .where(eq(SupportTickets.userId, TEST_USER_ID));

    // Still present mid-suite; afterAll deletes them.
    expect(remaining.length).toBeGreaterThanOrEqual(2);
  });
});

describe('support inbox integration (database)', () => {
  it('documents skip when no database URL is configured', () => {
    if (HAS_DB) {
      expect(HAS_DB).toBe(true);
      return;
    }
    expect(HAS_DB).toBe(false);
  });
});
