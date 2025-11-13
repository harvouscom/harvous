import type { APIRoute } from 'astro';
import { db, InboxItems, InboxItemNotes, UserInboxItems, UserMetadata, eq, and } from 'astro:db';

/**
 * Webflow Webhook Endpoint
 * 
 * Receives webhook notifications from Webflow when CMS items are:
 * - Created
 * - Updated
 * - Published
 * - Unpublished
 * - Deleted
 * 
 * This endpoint automatically syncs inbox items when threads are published
 * with the "Send to Harvous Inbox?" toggle enabled.
 * 
 * Webhook Setup:
 * 1. Go to Webflow Project Settings > Integrations > Webhooks
 * 2. Add a new webhook with URL: https://your-domain.com/api/webflow/webhook
 * 3. Select trigger: "Collection Item Changed" for Threads collection
 *    (This catches publishes, updates, and deletes - you only need one webhook)
 * 
 * Supported Trigger Types:
 * - collection_item.changed (from "Collection Item Changed" webhook)
 * - collection_item.created
 * - collection_item.updated
 * - collection_item.unpublished
 * - collection_item.deleted
 * 
 * The endpoint processes ALL trigger types except unpublished/deleted.
 * "Collection Item Changed" is fully supported and will fire for creates, updates, and publishes.
 */

const THREADS_COLLECTION_ID = '690ed2f0edd9bab40a4eb397';
const SITE_ID = '68feb1d0933e97605f9790ca';

interface WebflowWebhookPayload {
  triggerType: string;
  site: string;
  collection: string;
  item: {
    id: string;
    cmsLocaleId: string;
    lastPublished?: string;
    lastUpdated: string;
    createdOn: string;
    isArchived: boolean;
    isDraft: boolean;
    fieldData: {
      name?: string;
      content?: string;
      'color-2'?: string;
      notes?: string[];
      image?: string | { url: string };
      active?: boolean;
      [key: string]: any;
    };
  };
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const webflowToken = import.meta.env.WEBFLOW_API_TOKEN;
    const webflowWebhookSecret = import.meta.env.WEBFLOW_WEBHOOK_SECRET;
    
    if (!webflowToken) {
      console.error('Webflow API token not configured');
      return new Response(JSON.stringify({ error: 'Webflow API token not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get raw body for signature verification
    const rawBody = await request.text();
    
    // Verify webhook signature if secret is configured
    // Support multiple secrets (comma-separated) for different webhook event types
    if (webflowWebhookSecret) {
      const signature = request.headers.get('x-webflow-signature');
      if (!signature) {
        console.error('Webhook signature missing');
        return new Response(JSON.stringify({ error: 'Missing webhook signature' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Support multiple secrets (comma-separated) for different webhook configurations
      const secrets = webflowWebhookSecret.split(',').map(s => s.trim()).filter(s => s);
      const crypto = await import('crypto');
      
      // Webflow sends signature in format: sha256=<hex>
      const receivedSignature = signature.replace('sha256=', '');
      
      // Check against all configured secrets
      let signatureValid = false;
      for (const secret of secrets) {
        const expectedSignature = crypto
          .createHmac('sha256', secret)
          .update(rawBody)
          .digest('hex');
        
        if (receivedSignature === expectedSignature) {
          signatureValid = true;
          break;
        }
      }

      if (!signatureValid) {
        console.error('Webhook signature verification failed');
        return new Response(JSON.stringify({ error: 'Invalid webhook signature' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      console.log('Webhook signature verified successfully');
    }

    // Parse webhook payload
    const payload: WebflowWebhookPayload = JSON.parse(rawBody);
    
    console.log('Webhook received:', {
      triggerType: payload.triggerType,
      collection: payload.collection,
      itemId: payload.item?.id,
      isDraft: payload.item?.isDraft,
      lastPublished: payload.item?.lastPublished,
      active: payload.item?.fieldData?.active,
    });
    
    // Only process webhooks from Threads collection
    if (payload.collection !== THREADS_COLLECTION_ID) {
      console.log('Webhook ignored - not from Threads collection:', payload.collection);
      return new Response(JSON.stringify({ 
        message: 'Ignored - not from Threads collection',
        collection: payload.collection 
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Handle unpublished/deleted items - mark as inactive
    // These trigger types: collection_item.unpublished, collection_item.deleted
    if (payload.triggerType === 'collection_item.unpublished' || 
        payload.triggerType === 'collection_item.deleted') {
      console.log('Webhook processing unpublished/deleted item:', payload.triggerType);
      if (payload.item?.id) {
        const existingItem = await db
          .select()
          .from(InboxItems)
          .where(eq(InboxItems.webflowItemId, payload.item.id))
          .get();

        if (existingItem) {
          await db
            .update(InboxItems)
            .set({ isActive: false, updatedAt: new Date() })
            .where(eq(InboxItems.id, existingItem.id));
        }
      }

      return new Response(JSON.stringify({ 
        message: 'Item marked as inactive',
        triggerType: payload.triggerType 
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Process published/updated items
    // These trigger types include: collection_item.changed, collection_item.created, collection_item.updated
    // "Collection Item Changed" webhook fires for creates, updates, and publishes
    // We process ALL trigger types that aren't unpublished/deleted
    const validTriggerTypes = [
      'collection_item.changed',
      'collection_item_changed', 
      'collection_item.created',
      'collection_item_created',
      'collection_item.updated',
      'collection_item_updated',
    ];
    
    // Log if we get an unexpected trigger type (but still process it)
    if (!validTriggerTypes.includes(payload.triggerType) && 
        !payload.triggerType.includes('unpublished') && 
        !payload.triggerType.includes('deleted')) {
      console.log('Webhook received unexpected trigger type (will still process):', payload.triggerType);
    }
    
    console.log('Webhook processing published/updated item. Trigger type:', payload.triggerType);

    // Only process published items with "Send to Harvous Inbox?" toggle enabled
    if (!payload.item.fieldData?.active) {
      console.log('Webhook ignored - "Send to Harvous Inbox?" toggle not enabled for item:', payload.item.id);
      return new Response(JSON.stringify({ 
        message: 'Ignored - toggle not enabled',
        itemId: payload.item.id 
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Skip draft items
    if (payload.item.isDraft || !payload.item.lastPublished) {
      console.log('Webhook ignored - item is draft or not published:', {
        itemId: payload.item.id,
        isDraft: payload.item.isDraft,
        lastPublished: payload.item.lastPublished,
      });
      return new Response(JSON.stringify({ 
        message: 'Ignored - item is draft or not published',
        itemId: payload.item.id 
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Transform webhook item to sync format
    const webflowItem = {
      id: payload.item.id,
      fieldData: payload.item.fieldData,
      isDraft: payload.item.isDraft,
      lastPublished: payload.item.lastPublished,
      isArchived: payload.item.isArchived,
    };

    // Import sync logic from sync-inbox endpoint
    // We'll reuse the transformation and processing logic
    console.log('Processing webhook item:', payload.item.id);
    const syncResult = await processWebflowItem(webflowItem, webflowToken, SITE_ID);
    
    console.log('Webhook processing result:', {
      itemId: payload.item.id,
      synced: syncResult.synced,
      errors: syncResult.errors,
    });

    return new Response(JSON.stringify({
      success: true,
      message: 'Webhook processed successfully',
      triggerType: payload.triggerType,
      itemId: payload.item.id,
      synced: syncResult.synced,
      errors: syncResult.errors,
      note: syncResult.synced 
        ? 'Item synced successfully to inbox' 
        : 'Item processing failed - check errors',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Error processing webhook:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to process webhook',
      details: error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

/**
 * Process a single Webflow item and sync it to the inbox
 * Reuses logic from sync-inbox.ts
 */
async function processWebflowItem(
  item: any,
  webflowToken: string,
  siteId: string
): Promise<{ synced: boolean; errors: string[] }> {
  const errors: string[] = [];

  try {
    // Transform item to WebflowItem format
    const webflowItem = await transformWebflowItem(item, webflowToken);

    if (!webflowItem) {
      return { synced: false, errors: ['Failed to transform item'] };
    }

    // Skip draft items
    if (webflowItem['is-draft'] || !webflowItem['published-on']) {
      return { synced: false, errors: ['Item is draft or not published'] };
    }

    const webflowItemId = webflowItem._id;
    const contentType = 'thread'; // All items from Threads collection are threads

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
      targetAudience: webflowItem['target-audience'] || 'all_users',
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

    // Handle thread notes (MultiReference field)
    if (webflowItem['thread-notes'] && Array.isArray(webflowItem['thread-notes'])) {
      // Delete existing notes for this thread
      await db
        .delete(InboxItemNotes)
        .where(eq(InboxItemNotes.inboxItemId, inboxItemId));

      const threadNoteIds = webflowItem['thread-notes'];
      const notesCollectionId = '690ed346b73a1ff102283b32';
      
      // Fetch note items from Webflow
      const noteItems = await Promise.all(
        threadNoteIds.map(async (noteId: string, index: number) => {
          try {
            const noteResponse = await fetch(
              `https://api.webflow.com/v2/collections/${notesCollectionId}/items/${noteId}`,
              {
                headers: {
                  'Authorization': `Bearer ${webflowToken}`,
                  'Accept-Version': '1.0.0',
                }
              }
            );
            
            if (noteResponse.ok) {
              const noteData = await noteResponse.json();
              const note = noteData.items?.[0] || noteData;
              return {
                title: note.fieldData?.name || null,
                content: note.fieldData?.content || '',
                order: index,
              };
            }
          } catch (error) {
            console.error(`Error fetching note ${noteId}:`, error);
          }
          return {
            title: null,
            content: '',
            order: index,
          };
        })
      );

      // Insert notes
      for (let i = 0; i < noteItems.length; i++) {
        const note = noteItems[i];
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

    // Auto-assign to users based on targetAudience
    if (inboxItemData.targetAudience === 'all_users' || inboxItemData.targetAudience === 'all_new_users') {
      // Get all existing users
      const allUsers = await db.select().from(UserMetadata);
      
      // Create UserInboxItems for all existing users
      for (const user of allUsers) {
        const existingUserInboxItem = await db
          .select()
          .from(UserInboxItems)
          .where(
            and(
              eq(UserInboxItems.userId, user.userId),
              eq(UserInboxItems.inboxItemId, inboxItemId)
            )
          )
          .get();

        if (!existingUserInboxItem) {
          await db.insert(UserInboxItems).values({
            id: `user_inbox_${user.userId}_${inboxItemId}_${Date.now()}`,
            userId: user.userId,
            inboxItemId: inboxItemId,
            status: 'inbox',
            createdAt: new Date(),
          });
        }
      }
    }

    return { synced: true, errors: [] };

  } catch (error: any) {
    console.error(`Error processing webhook item:`, error);
    errors.push(`Failed to process item: ${error.message}`);
    return { synced: false, errors };
  }
}

/**
 * Transform Webflow item to WebflowItem format
 * Reuses transformation logic from sync-inbox.ts
 */
async function transformWebflowItem(item: any, webflowToken: string): Promise<any> {
  const COLOR_MAP: Record<string, string> = {
    'blue': 'blessed-blue',
    'yellow': 'graceful-gold',
    'orange': 'pleasant-peach',
    'pink': 'peaceful-pink',
    'purple': 'lovely-lavender',
    'green': 'mindful-mint',
    'paper': 'paper',
  };

  const transformed: any = {
    _id: item.id,
    'is-draft': item.isDraft || false,
    'published-on': item.lastPublished || undefined,
  };

  transformed['content-type'] = 'thread';

  if (item.fieldData) {
    // Map name to title
    transformed.title = item.fieldData.name;

    // Map content
    transformed.content = item.fieldData.content;

    // Handle color reference (color-2 field)
    if (item.fieldData['color-2']) {
      try {
        const colorResponse = await fetch(
          `https://api.webflow.com/v2/collections/6915354840aef29a7530463c/items/${item.fieldData['color-2']}`,
          {
            headers: {
              'Authorization': `Bearer ${webflowToken}`,
              'Accept-Version': '1.0.0',
            }
          }
        );
        if (colorResponse.ok) {
          const colorData = await colorResponse.json();
          const colorItem = colorData.items?.[0] || colorData;
          const colorSlug = colorItem.fieldData?.slug || colorItem.fieldData?.name?.toLowerCase();
          transformed.color = COLOR_MAP[colorSlug] || 'blessed-blue';
        }
      } catch (error) {
        console.error('Error fetching color:', error);
        transformed.color = 'blessed-blue'; // default
      }
    }

    // Handle thread notes (MultiReference field)
    if (item.fieldData.notes && Array.isArray(item.fieldData.notes)) {
      transformed['thread-notes'] = item.fieldData.notes;
    }

    // Handle image
    if (item.fieldData.image) {
      if (typeof item.fieldData.image === 'string') {
        transformed['image-url'] = item.fieldData.image;
      } else if (item.fieldData.image.url) {
        transformed['image-url'] = item.fieldData.image.url;
      }
    }

    // Set target-audience based on thread title
    // "Welcome to Harvous" is for new users only, all others are for all users
    const threadTitle = item.fieldData.name || '';
    if (threadTitle.toLowerCase().includes('welcome to harvous')) {
      transformed['target-audience'] = 'all_new_users';
    } else {
      transformed['target-audience'] = 'all_users';
    }

    // Set is-active based on archived status
    transformed['is-active'] = !item.isArchived;
  }

  return transformed;
}

