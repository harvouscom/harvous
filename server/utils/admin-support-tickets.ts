/**
 * Admin queries for SupportTickets inbox.
 */

import { db, SupportTickets, eq, desc, count, and, isNull, or } from '../db';
import { nowISO } from '../db/dates';
import { isSupportTicketStatus, type SupportTicketStatus } from './support-ticket';

export type SupportTicketListItem = {
  id: string;
  ticketNumber: number | null;
  topic: string | null;
  message: string;
  userName: string | null;
  userEmail: string | null;
  status: SupportTicketStatus;
  unread: boolean;
  createdAt: string;
};

export type SupportTicketDetail = SupportTicketListItem & {
  userId: string;
  appVersion: string | null;
  pageUrl: string | null;
  clientEnvironment: string | null;
  adminNote: string | null;
  adminReadAt: string | null;
  closedAt: string | null;
};

export type SupportTicketListFilter = 'open' | 'closed' | 'all';

function rowToIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function mapListRow(row: typeof SupportTickets.$inferSelect): SupportTicketListItem {
  return {
    id: row.id,
    ticketNumber: row.ticketNumber,
    topic: row.topic,
    message: row.message,
    userName: row.userName,
    userEmail: row.userEmail,
    status: row.status as SupportTicketStatus,
    unread: row.adminReadAt == null,
    createdAt: rowToIso(row.createdAt) ?? '',
  };
}

function mapDetailRow(row: typeof SupportTickets.$inferSelect): SupportTicketDetail {
  return {
    ...mapListRow(row),
    userId: row.userId,
    appVersion: row.appVersion,
    pageUrl: row.pageUrl,
    clientEnvironment: row.clientEnvironment,
    adminNote: row.adminNote,
    adminReadAt: rowToIso(row.adminReadAt),
    closedAt: rowToIso(row.closedAt),
  };
}

export async function countOpenSupportTickets(): Promise<number> {
  const result = await db
    .select({ value: count() })
    .from(SupportTickets)
    .where(eq(SupportTickets.status, 'open'));
  return Number(result[0]?.value ?? 0);
}

/** Tickets the admin has not read yet — drives the sidebar badge. */
export async function countUnreadSupportTickets(): Promise<number> {
  const result = await db
    .select({ value: count() })
    .from(SupportTickets)
    .where(isNull(SupportTickets.adminReadAt));
  return Number(result[0]?.value ?? 0);
}

export async function listSupportTickets(
  filter: SupportTicketListFilter,
  limit = 50,
  offset = 0,
): Promise<{ tickets: SupportTicketListItem[]; openCount: number; unreadCount: number }> {
  const safeLimit = Math.min(Math.max(limit, 1), 100);
  const safeOffset = Math.max(offset, 0);

  const where =
    filter === 'all'
      ? undefined
      : filter === 'closed'
        ? eq(SupportTickets.status, 'closed')
        : eq(SupportTickets.status, 'open');

  const rows = await db
    .select()
    .from(SupportTickets)
    .where(where)
    .orderBy(desc(SupportTickets.createdAt))
    .limit(safeLimit)
    .offset(safeOffset);

  const [openCount, unreadCount] = await Promise.all([countOpenSupportTickets(), countUnreadSupportTickets()]);

  return {
    tickets: rows.map(mapListRow),
    openCount,
    unreadCount,
  };
}

export async function resolveSupportTicketId(idOrNumber: string): Promise<string | null> {
  const trimmed = idOrNumber.trim();
  if (!trimmed) return null;
  if (/^\d+$/.test(trimmed)) {
    const ticketNumber = parseInt(trimmed, 10);
    const rows = await db
      .select({ id: SupportTickets.id })
      .from(SupportTickets)
      .where(or(eq(SupportTickets.ticketNumber, ticketNumber), eq(SupportTickets.id, trimmed)))
      .limit(1);
    return rows[0]?.id ?? null;
  }
  return trimmed;
}

export async function getSupportTicket(
  id: string,
  options?: { markRead?: boolean },
): Promise<SupportTicketDetail | null> {
  const resolvedId = await resolveSupportTicketId(id);
  if (!resolvedId) return null;

  const rows = await db.select().from(SupportTickets).where(eq(SupportTickets.id, resolvedId)).limit(1);
  const row = rows[0];
  if (!row) return null;

  if (options?.markRead && row.adminReadAt == null) {
    const readAt = nowISO();
    await db.update(SupportTickets).set({ adminReadAt: readAt }).where(eq(SupportTickets.id, resolvedId));
    return mapDetailRow({ ...row, adminReadAt: readAt });
  }

  return mapDetailRow(row);
}

export type PatchSupportTicketInput = {
  status?: SupportTicketStatus;
  adminNote?: string | null;
  read?: boolean;
};

export function validatePatchSupportTicketInput(body: unknown): PatchSupportTicketInput | null {
  if (!body || typeof body !== 'object') return null;
  const { status, adminNote, read } = body as Record<string, unknown>;
  const patch: PatchSupportTicketInput = {};

  if (status !== undefined) {
    if (typeof status !== 'string' || !isSupportTicketStatus(status)) return null;
    patch.status = status;
  }

  if (adminNote !== undefined) {
    if (adminNote !== null && typeof adminNote !== 'string') return null;
    patch.adminNote = typeof adminNote === 'string' ? adminNote : null;
  }

  if (read !== undefined) {
    if (typeof read !== 'boolean') return null;
    patch.read = read;
  }

  if (patch.status === undefined && patch.adminNote === undefined && patch.read === undefined) return null;
  return patch;
}

export async function patchSupportTicket(
  id: string,
  patch: PatchSupportTicketInput,
): Promise<SupportTicketDetail | null> {
  const resolvedId = await resolveSupportTicketId(id);
  if (!resolvedId) return null;

  const existing = await getSupportTicket(resolvedId);
  if (!existing) return null;

  const updates: Partial<typeof SupportTickets.$inferInsert> = {};

  if (patch.status !== undefined) {
    updates.status = patch.status;
    updates.closedAt = patch.status === 'closed' ? nowISO() : null;
  }

  if (patch.adminNote !== undefined) {
    updates.adminNote = patch.adminNote;
  }

  if (patch.read !== undefined) {
    updates.adminReadAt = patch.read ? nowISO() : null;
  }

  if (Object.keys(updates).length === 0) return existing;

  await db.update(SupportTickets).set(updates).where(eq(SupportTickets.id, resolvedId));
  return getSupportTicket(resolvedId);
}

export function parseSupportTicketListFilter(value: string | undefined): SupportTicketListFilter {
  if (value === 'closed' || value === 'all') return value;
  return 'open';
}
