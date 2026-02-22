/**
 * Inbox data utilities — Drizzle port of src/utils/inbox-data.ts
 *
 * Only the functions needed by /api/navigation/data are ported here:
 *   - getInboxItems(userId)
 *   - getInboxCount(userId)
 */

import { db, InboxItems, UserInboxItems, eq, and, desc } from '../db';

export async function getInboxItems(userId: string) {
  try {
    const userInboxItems = await db
      .select({
        inboxItem: InboxItems,
        userInboxItem: UserInboxItems,
      })
      .from(UserInboxItems)
      .innerJoin(InboxItems, eq(UserInboxItems.inboxItemId, InboxItems.id))
      .where(
        and(
          eq(UserInboxItems.userId, userId),
          eq(UserInboxItems.status, 'inbox'),
          eq(InboxItems.isActive, true)
        )
      )
      .orderBy(desc(InboxItems.createdAt))
      .all();

    return userInboxItems.map(item => ({
      ...item.inboxItem,
      userStatus: item.userInboxItem.status,
      createdAt: item.userInboxItem.createdAt,
    }));
  } catch (error) {
    console.error("Error fetching inbox items:", error);
    return [];
  }
}

export async function getInboxCount(userId: string): Promise<number> {
  try {
    const result = await db
      .select({ count: UserInboxItems.id })
      .from(UserInboxItems)
      .innerJoin(InboxItems, eq(UserInboxItems.inboxItemId, InboxItems.id))
      .where(
        and(
          eq(UserInboxItems.userId, userId),
          eq(UserInboxItems.status, 'inbox'),
          eq(InboxItems.isActive, true)
        )
      );

    return result.length;
  } catch (error) {
    console.error("Error fetching inbox count:", error);
    return 0;
  }
}
