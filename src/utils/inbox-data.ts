import { db, InboxItems, InboxItemNotes, UserInboxItems, eq, and, desc } from "astro:db";

/**
 * Get all inbox items for a user (status='inbox')
 * 
 * Only returns items that are:
 * - Active (isActive: true) - items are marked inactive when:
 *   - "Send to Harvous Inbox?" toggle is turned off
 *   - Item is archived in Webflow
 *   - Item is deleted in Webflow
 * - Published - items are only created/updated for published items (not drafts)
 *   This is enforced in the sync and webhook endpoints
 */
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
          eq(InboxItems.isActive, true) // Only show active items (published, not archived/deleted)
        )
      )
      .orderBy(desc(InboxItems.createdAt));

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

/**
 * Get all archived items for a user (status='archived')
 */
export async function getArchivedItems(userId: string) {
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
          eq(UserInboxItems.status, 'archived')
        )
      )
      .orderBy(desc(UserInboxItems.archivedAt));

    return userInboxItems.map(item => ({
      ...item.inboxItem,
      userStatus: item.userInboxItem.status,
      archivedAt: item.userInboxItem.archivedAt,
    }));
  } catch (error) {
    console.error("Error fetching archived items:", error);
    return [];
  }
}

/**
 * Get inbox count for a user
 * 
 * Only counts items that are:
 * - Active (isActive: true) - excludes archived/deleted/toggled-off items
 * - Published - items are only created for published items (enforced in sync/webhook)
 */
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
          eq(InboxItems.isActive, true) // Only count active items (published, not archived/deleted)
        )
      );

    return result.length;
  } catch (error) {
    console.error("Error fetching inbox count:", error);
    return 0;
  }
}

/**
 * Add an inbox item to a user's inbox
 */
export async function addInboxItemToUser(userId: string, inboxItemId: string) {
  try {
    // Check if already exists
    const existing = await db
      .select()
      .from(UserInboxItems)
      .where(
        and(
          eq(UserInboxItems.userId, userId),
          eq(UserInboxItems.inboxItemId, inboxItemId)
        )
      )
      .get();

    if (existing) {
      return existing;
    }

    // Create new UserInboxItem
    const userInboxItem = await db
      .insert(UserInboxItems)
      .values({
        id: `user_inbox_${userId}_${inboxItemId}_${Date.now()}`,
        userId: userId,
        inboxItemId: inboxItemId,
        status: 'inbox',
        createdAt: new Date(),
      })
      .returning()
      .get();

    return userInboxItem;
  } catch (error) {
    console.error("Error adding inbox item to user:", error);
    throw error;
  }
}

/**
 * Get an inbox item with its associated notes (for threads)
 */
export async function getInboxItemWithNotes(inboxItemId: string) {
  try {
    const inboxItem = await db
      .select()
      .from(InboxItems)
      .where(eq(InboxItems.id, inboxItemId))
      .get();

    if (!inboxItem) {
      return null;
    }

    // If it's a thread, get associated notes
    if (inboxItem.contentType === 'thread') {
      const notes = await db
        .select()
        .from(InboxItemNotes)
        .where(eq(InboxItemNotes.inboxItemId, inboxItemId))
        .orderBy(InboxItemNotes.order);

      return {
        ...inboxItem,
        notes: notes,
      };
    }

    return {
      ...inboxItem,
      notes: [],
    };
  } catch (error) {
    console.error("Error fetching inbox item with notes:", error);
    return null;
  }
}

/**
 * Get inbox item by ID
 */
export async function getInboxItemById(inboxItemId: string) {
  try {
    const inboxItem = await db
      .select()
      .from(InboxItems)
      .where(eq(InboxItems.id, inboxItemId))
      .get();

    return inboxItem || null;
  } catch (error) {
    console.error("Error fetching inbox item:", error);
    return null;
  }
}

