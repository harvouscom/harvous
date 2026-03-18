/**
 * Inbox data utilities — Drizzle port of src/utils/inbox-data.ts
 *
 * Functions:
 *   - getInboxItems(userId)
 *   - getInboxCount(userId)
 *   - getInboxItemWithNotes(inboxItemId)
 */

import { db, first, InboxItems, InboxItemNotes, UserInboxItems, eq, and, desc } from '../db';
import { asc } from 'drizzle-orm';

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
      ;

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

export async function getInboxItemWithNotes(inboxItemId: string) {
  try {
    // Fetch inbox item and notes in parallel for better performance
    const [inboxItem, notes] = await Promise.all([
      db
        .select()
        .from(InboxItems)
        .where(eq(InboxItems.id, inboxItemId))
        .limit(1)
        .then(rows => first(rows)),
      // Pre-fetch notes (will be empty array if not a thread, but avoids conditional query)
      db
        .select()
        .from(InboxItemNotes)
        .where(eq(InboxItemNotes.inboxItemId, inboxItemId))
        .orderBy(asc(InboxItemNotes.order))
        
    ]);

    if (!inboxItem) {
      return null;
    }

    // Return notes only if it's a thread, otherwise empty array
    return {
      ...inboxItem,
      notes: inboxItem.contentType === 'thread' ? notes : [],
    };
  } catch (error) {
    console.error("Error fetching inbox item with notes:", error);
    return null;
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
