import type { APIRoute } from 'astro';
import { db, InboxItems, InboxItemNotes, UserInboxItems, eq } from 'astro:db';

interface WebflowItem {
  _id: string;
  'content-type'?: string;
  'content-type-slug'?: string;
  title?: string;
  subtitle?: string;
  content?: string;
  'image-url'?: string | { url: string };
  color?: string;
  'target-audience'?: string;
  'is-active'?: boolean;
  'thread-notes'?: string[]; // Array of referenced note IDs
  'is-draft'?: boolean;
  'published-on'?: string;
}

interface WebflowNoteItem {
  _id: string;
  title?: string;
  content?: string;
  order?: number;
}

/**
 * Sync inbox items from Webflow CMS
 * This endpoint can be called:
 * 1. Manually via POST with Webflow data
 * 2. As a scheduled job that fetches from Webflow API
 */
export const POST: APIRoute = async ({ request }) => {
  try {
    const webflowToken = import.meta.env.WEBFLOW_API_TOKEN;
    
    if (!webflowToken) {
      return new Response(JSON.stringify({ error: 'Webflow API token not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const body = await request.json();
    const { items, collectionId, siteId } = body;

    // If items are provided directly, use them
    // Otherwise, fetch from Webflow API
    let webflowItems: WebflowItem[] = items || [];

    if (!items && collectionId && siteId) {
      // Fetch from Webflow API
      const response = await fetch(
        `https://api.webflow.com/v2/collections/${collectionId}/items`,
        {
          headers: {
            'Authorization': `Bearer ${webflowToken}`,
            'Accept-Version': '1.0.0',
          }
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Webflow API error:', errorText);
        return new Response(JSON.stringify({ error: 'Failed to fetch from Webflow API', details: errorText }), {
          status: response.status,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const data = await response.json();
      webflowItems = data.items || [];
    }

    if (!webflowItems || webflowItems.length === 0) {
      return new Response(JSON.stringify({ error: 'No items provided' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const syncedItems: string[] = [];
    const errors: string[] = [];

    // Process each Webflow item
    for (const webflowItem of webflowItems) {
      try {
        // Skip draft items
        if (webflowItem['is-draft'] || !webflowItem['published-on']) {
          continue;
        }

        const webflowItemId = webflowItem._id;
        const contentType = webflowItem['content-type'] || 'note';
        
        // Validate contentType
        if (contentType !== 'thread' && contentType !== 'note') {
          errors.push(`Invalid content type for item ${webflowItemId}: ${contentType}`);
          continue;
        }

        // Extract image URL
        let imageUrl: string | undefined;
        if (webflowItem['image-url']) {
          if (typeof webflowItem['image-url'] === 'string') {
            imageUrl = webflowItem['image-url'];
          } else if (webflowItem['image-url']?.url) {
            imageUrl = webflowItem['image-url'].url;
          }
        }

        // Check if item already exists
        const existingItem = await db
          .select()
          .from(InboxItems)
          .where(eq(InboxItems.webflowItemId, webflowItemId))
          .get();

        const inboxItemId = existingItem?.id || `inbox_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Create or update inbox item
        const inboxItemData = {
          id: inboxItemId,
          webflowItemId: webflowItemId,
          contentType: contentType,
          title: webflowItem.title || 'Untitled',
          subtitle: webflowItem.subtitle || null,
          content: webflowItem.content || null,
          imageUrl: imageUrl || null,
          color: webflowItem.color || null,
          targetAudience: webflowItem['target-audience'] || 'all_new_users',
          isActive: webflowItem['is-active'] !== false,
          updatedAt: new Date(),
        };

        if (existingItem) {
          // Update existing item
          await db
            .update(InboxItems)
            .set(inboxItemData)
            .where(eq(InboxItems.id, inboxItemId));
        } else {
          // Create new item
          inboxItemData.createdAt = new Date();
          await db.insert(InboxItems).values(inboxItemData);
        }

        // If it's a thread, handle thread notes
        if (contentType === 'thread' && webflowItem['thread-notes'] && Array.isArray(webflowItem['thread-notes'])) {
          // Delete existing notes for this thread
          await db
            .delete(InboxItemNotes)
            .where(eq(InboxItemNotes.inboxItemId, inboxItemId));

          // Fetch note items from Webflow (assuming they're in a separate collection)
          // For now, we'll expect the notes to be provided in the request
          // In a full implementation, you'd fetch them from Webflow's reference field
          const threadNoteIds = webflowItem['thread-notes'];
          
          // If notes are provided in the request body, use them
          if (body.threadNotes && body.threadNotes[webflowItemId]) {
            const notes = body.threadNotes[webflowItemId];
            for (let i = 0; i < notes.length; i++) {
              const note = notes[i];
              await db.insert(InboxItemNotes).values({
                id: `inbox_note_${Date.now()}_${i}_${Math.random().toString(36).substr(2, 9)}`,
                inboxItemId: inboxItemId,
                title: note.title || null,
                content: note.content || '',
                order: note.order || i,
                createdAt: new Date(),
              });
            }
          }
        }

        syncedItems.push(inboxItemId);

        // Auto-assign to users based on targetAudience
        if (inboxItemData.targetAudience === 'all_new_users' || inboxItemData.targetAudience === 'all_users') {
          // This will be handled by the new user creation flow
          // For now, we'll create UserInboxItems for existing users if targetAudience is 'all_users'
          if (inboxItemData.targetAudience === 'all_users') {
            // Note: This would require fetching all users, which might be expensive
            // For now, we'll handle this in the user creation middleware
          }
        }

      } catch (error: any) {
        console.error(`Error syncing item ${webflowItem._id}:`, error);
        errors.push(`Failed to sync item ${webflowItem._id}: ${error.message}`);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      synced: syncedItems.length,
      items: syncedItems,
      errors: errors.length > 0 ? errors : undefined,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Error syncing inbox items:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to sync inbox items',
      details: error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

/**
 * GET endpoint to manually trigger sync from Webflow
 * Requires collectionId and siteId as query parameters
 */
export const GET: APIRoute = async ({ url }) => {
  try {
    const webflowToken = import.meta.env.WEBFLOW_API_TOKEN;
    
    if (!webflowToken) {
      return new Response(JSON.stringify({ error: 'Webflow API token not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const collectionId = url.searchParams.get('collectionId');
    const siteId = url.searchParams.get('siteId');

    if (!collectionId || !siteId) {
      return new Response(JSON.stringify({ error: 'collectionId and siteId are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Fetch from Webflow API
    const response = await fetch(
      `https://api.webflow.com/v2/collections/${collectionId}/items`,
      {
        headers: {
          'Authorization': `Bearer ${webflowToken}`,
          'Accept-Version': '1.0.0',
        }
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return new Response(JSON.stringify({ error: 'Failed to fetch from Webflow API', details: errorText }), {
        status: response.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const data = await response.json();
    const items = data.items || [];

    // Process items (reuse POST logic)
    const request = new Request(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items, collectionId, siteId }),
    });

    return POST({ request } as any);

  } catch (error: any) {
    console.error('Error fetching from Webflow:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to fetch from Webflow',
      details: error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

