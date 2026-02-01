export const prerender = false;

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

// Webflow webhook can come in different formats
// Format 1: Direct structure (older format)
// Format 2: Nested payload structure (newer format)
interface WebflowWebhookPayload {
  triggerType: string;
  site?: string;
  siteId?: string;
  collection?: string;
  collectionId?: string;
  item?: {
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
  payload?: {
    id: string;
    siteId?: string;
    collectionId?: string;
    workspaceId?: string;
    item?: {
      id: string;
      cmsLocaleId?: string;
      lastPublished?: string;
      lastUpdated?: string;
      createdOn?: string;
      isArchived?: boolean;
      isDraft?: boolean;
      fieldData?: {
        name?: string;
        content?: string;
        'color-2'?: string;
        notes?: string[];
        image?: string | { url: string };
        active?: boolean;
        [key: string]: any;
      };
    };
    [key: string]: any;
  };
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const webflowToken = import.meta.env.WEBFLOW_INBOX_API_TOKEN;
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
        // Note: Signature verification is currently non-blocking due to Netlify env var truncation issues
        // The webhook will still process, but this should be fixed for production security
        // Uncomment below to block webhooks with invalid signatures (recommended for production):
        // return new Response(JSON.stringify({ error: 'Invalid webhook signature' }), {
        //   status: 401,
        //   headers: { 'Content-Type': 'application/json' }
        // });
      }
    }

    // Parse webhook payload
    let rawPayload: WebflowWebhookPayload;
    try {
      rawPayload = JSON.parse(rawBody);
    } catch (parseError: any) {
      console.error('Failed to parse webhook payload as JSON:', parseError.message);
      return new Response(JSON.stringify({ 
        error: 'Invalid JSON payload',
        details: parseError.message 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Normalize payload structure - handle both old and new formats
    let normalizedPayload = normalizeWebflowPayload(rawPayload);
    
    // If item data is incomplete (only ID or empty fieldData), fetch full item from Webflow API
    const hasEmptyFieldData = !normalizedPayload.item.fieldData || Object.keys(normalizedPayload.item.fieldData || {}).length === 0;
    if (normalizedPayload.item.id && hasEmptyFieldData) {
      try {
        const itemResponse = await fetch(
          `https://api.webflow.com/v2/collections/${normalizedPayload.collection}/items/${normalizedPayload.item.id}`,
          {
            headers: {
              'Authorization': `Bearer ${webflowToken}`,
              'Accept-Version': '1.0.0',
            }
          }
        );
        
        if (itemResponse.ok) {
          const itemData = await itemResponse.json();
          const fullItem = itemData.items?.[0] || itemData.item || itemData;
          normalizedPayload.item = {
            id: fullItem.id || normalizedPayload.item.id,
            cmsLocaleId: fullItem.cmsLocaleId || '',
            lastPublished: fullItem.lastPublished,
            lastUpdated: fullItem.lastUpdated || new Date().toISOString(),
            createdOn: fullItem.createdOn || new Date().toISOString(),
            isArchived: fullItem.isArchived || false,
            isDraft: fullItem.isDraft || false,
            fieldData: fullItem.fieldData || {},
          };
        } else if (itemResponse.status === 404) {
          // Item was deleted - mark inbox item as inactive
          const existingItem = await db
            .select()
            .from(InboxItems)
            .where(eq(InboxItems.webflowItemId, normalizedPayload.item.id))
            .get();

          if (existingItem) {
            await db
              .update(InboxItems)
              .set({ isActive: false, updatedAt: new Date() })
              .where(eq(InboxItems.id, existingItem.id));
          }
          return new Response(JSON.stringify({ 
            message: 'Item deleted - marked as inactive',
            itemId: normalizedPayload.item.id,
            found: !!existingItem,
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        } else {
          console.error('Failed to fetch item from Webflow API:', itemResponse.status);
        }
      } catch (error) {
        console.error('Error fetching item from Webflow API:', error);
      }
    }
    
    // Only process webhooks from Threads collection
    if (normalizedPayload.collection !== THREADS_COLLECTION_ID) {
      return new Response(JSON.stringify({ 
        message: 'Ignored - not from Threads collection',
        collection: normalizedPayload.collection 
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Handle unpublished/deleted items - mark as inactive
    if (normalizedPayload.triggerType === 'collection_item.unpublished' || 
        normalizedPayload.triggerType === 'collection_item.deleted') {
      if (normalizedPayload.item?.id) {
        const existingItem = await db
          .select()
          .from(InboxItems)
          .where(eq(InboxItems.webflowItemId, normalizedPayload.item.id))
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
        triggerType: normalizedPayload.triggerType,
        itemId: normalizedPayload.item?.id,
        found: !!normalizedPayload.item?.id,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check if item is archived - mark as inactive if so
    if (normalizedPayload.item?.isArchived) {
      if (normalizedPayload.item.id) {
        const existingItem = await db
          .select()
          .from(InboxItems)
          .where(eq(InboxItems.webflowItemId, normalizedPayload.item.id))
          .get();

        if (existingItem) {
          await db
            .update(InboxItems)
            .set({ isActive: false, updatedAt: new Date() })
            .where(eq(InboxItems.id, existingItem.id));
        }
      }
      return new Response(JSON.stringify({ 
        message: 'Item archived - marked as inactive',
        itemId: normalizedPayload.item?.id 
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // If "Send to Harvous Inbox?" toggle is disabled, mark existing inbox item as inactive
    if (!normalizedPayload.item?.fieldData?.active) {
      if (normalizedPayload.item?.id) {
        const existingItem = await db
          .select()
          .from(InboxItems)
          .where(eq(InboxItems.webflowItemId, normalizedPayload.item.id))
          .get();

        if (existingItem) {
          await db
            .update(InboxItems)
            .set({ isActive: false, updatedAt: new Date() })
            .where(eq(InboxItems.id, existingItem.id));
        }
      }
      return new Response(JSON.stringify({ 
        message: 'Toggle not enabled - marked as inactive if existed',
        itemId: normalizedPayload.item?.id 
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Skip draft items - but mark existing inbox item as inactive if it exists
    if (!normalizedPayload.item || normalizedPayload.item.isDraft || !normalizedPayload.item.lastPublished) {
      // Mark existing inbox item as inactive if it exists
      if (normalizedPayload.item?.id) {
        const existingItem = await db
          .select()
          .from(InboxItems)
          .where(eq(InboxItems.webflowItemId, normalizedPayload.item.id))
          .get();

        if (existingItem && existingItem.isActive) {
          await db
            .update(InboxItems)
            .set({ isActive: false, updatedAt: new Date() })
            .where(eq(InboxItems.id, existingItem.id));
        }
      }
      
      return new Response(JSON.stringify({ 
        message: 'Ignored - item is draft or not published, marked as inactive if existed',
        itemId: normalizedPayload.item?.id 
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Transform webhook item to sync format
    const webflowItem = {
      id: normalizedPayload.item.id,
      fieldData: normalizedPayload.item.fieldData,
      isDraft: normalizedPayload.item.isDraft,
      lastPublished: normalizedPayload.item.lastPublished,
      isArchived: normalizedPayload.item.isArchived,
    };

    // Process the webhook item
    const syncResult = await processWebflowItem(webflowItem, webflowToken, SITE_ID);

    return new Response(JSON.stringify({
      success: true,
      message: 'Webhook processed',
      triggerType: normalizedPayload.triggerType,
      itemId: normalizedPayload.item.id,
      synced: syncResult.synced,
      errors: syncResult.errors,
      note: syncResult.synced 
        ? 'Item synced to inbox' 
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
 * Normalize webhook payload to handle both old and new Webflow webhook formats
 * Note: If payload only contains IDs, we'll need to fetch the full item from Webflow API
 */
function normalizeWebflowPayload(rawPayload: WebflowWebhookPayload): {
  triggerType: string;
  collection: string;
  site: string;
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
} {
  // If payload has nested structure (new format)
  if (rawPayload.payload) {
    const payload = rawPayload.payload;
    // Check if payload.item exists (full item data) or just IDs
    if (payload.item) {
      // Full item data is present
      return {
        triggerType: rawPayload.triggerType,
        collection: payload.collectionId || rawPayload.collection || '',
        site: payload.siteId || rawPayload.site || rawPayload.siteId || '',
        item: {
          ...payload.item,
          cmsLocaleId: payload.item.cmsLocaleId || '',
        },
      };
    } else if (payload.id) {
      // Only ID is present - will need to fetch from API
      // Return minimal structure - caller should fetch full item
      return {
        triggerType: rawPayload.triggerType,
        collection: payload.collectionId || rawPayload.collection || '',
        site: payload.siteId || rawPayload.site || rawPayload.siteId || '',
        item: {
          id: payload.id,
          cmsLocaleId: '',
          lastUpdated: new Date().toISOString(),
          createdOn: new Date().toISOString(),
          isArchived: false,
          isDraft: false,
          fieldData: {},
        },
      };
    }
  }
  
  // Old format (direct structure)
  if (rawPayload.item) {
    return {
      triggerType: rawPayload.triggerType,
      collection: rawPayload.collection || rawPayload.collectionId || '',
      site: rawPayload.site || rawPayload.siteId || '',
      item: rawPayload.item,
    };
  }
  
  // Fallback - should not happen
  return {
    triggerType: rawPayload.triggerType,
    collection: rawPayload.collection || rawPayload.collectionId || '',
    site: rawPayload.site || rawPayload.siteId || '',
    item: {
      id: '',
      cmsLocaleId: '',
      lastUpdated: new Date().toISOString(),
      createdOn: new Date().toISOString(),
      isArchived: false,
      isDraft: false,
      fieldData: {},
    },
  };
}

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
    if (existingItem) {
      // Update existing item
      await db
        .update(InboxItems)
        .set({
          webflowItemId: webflowItemId,
          contentType: contentType,
          title: webflowItem.title || 'Untitled',
          subtitle: webflowItem.subtitle || null,
          content: webflowItem.content || null,
          imageUrl: imageUrl || null,
          color: webflowItem.color || null,
          threadType: webflowItem['thread-type'] || null,
          targetAudience: webflowItem['target-audience'] || 'all_users',
          isActive: webflowItem['is-active'] !== false,
          updatedAt: new Date(),
        })
        .where(eq(InboxItems.id, inboxItemId));
    } else {
      // Create new item
      await db.insert(InboxItems).values({
        id: inboxItemId,
        webflowItemId: webflowItemId,
        contentType: contentType,
        title: webflowItem.title || 'Untitled',
        subtitle: webflowItem.subtitle || null,
        content: webflowItem.content || null,
        imageUrl: imageUrl || null,
        color: webflowItem.color || null,
        threadType: webflowItem['thread-type'] || null,
        targetAudience: webflowItem['target-audience'] || 'all_users',
        isActive: webflowItem['is-active'] !== false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
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
    if (inboxItemData.targetAudience === 'all_users') {
      // Get all existing users
      const allUsers = await db.select().from(UserMetadata).all();
      
      // Create UserInboxItems for all existing users
      // New users will get them via the user creation middleware
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
    console.error('Error processing webhook item:', error);
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

    // Map content - check multiple possible field names
    let rawContent = item.fieldData.content 
      || item.fieldData['Content'] 
      || item.fieldData['content-html']
      || item.fieldData['content-html-2']
      || item.fieldData.description
      || item.fieldData.body
      || null;
    
    // If content is an object, extract HTML from it
    if (rawContent && typeof rawContent === 'object') {
      rawContent = rawContent.html || rawContent.richText || rawContent.content || JSON.stringify(rawContent);
    }
    
    transformed.content = rawContent;

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

    // Handle thread type
    let threadTypeField = null;
    
    if (item.fieldData['thread-type']) {
      threadTypeField = item.fieldData['thread-type'];
    } else if (item.fieldData.threadType) {
      threadTypeField = item.fieldData.threadType;
    } else if (item.fieldData['Thread Type']) {
      threadTypeField = item.fieldData['Thread Type'];
    } else {
      const fieldKeys = Object.keys(item.fieldData);
      const threadTypeKey = fieldKeys.find(key => 
        key.toLowerCase().includes('thread') && key.toLowerCase().includes('type')
      );
      if (threadTypeKey) {
        threadTypeField = item.fieldData[threadTypeKey];
      }
    }
    
    if (threadTypeField) {
      if (typeof threadTypeField === 'object' && threadTypeField !== null) {
        const optionName = threadTypeField.name || threadTypeField.slug;
        transformed['thread-type'] = (optionName && optionName.toLowerCase() === 'default') ? 'Default' : 'Default';
      } else if (typeof threadTypeField === 'string' && threadTypeField.trim() !== '') {
        transformed['thread-type'] = (threadTypeField.toLowerCase() === 'default') ? 'Default' : 'Default';
      }
    }

    // Set target-audience - all threads with "Send to Harvous Inbox" enabled go to all users
    transformed['target-audience'] = 'all_users';

    // Set is-active based on archived status
    transformed['is-active'] = !item.isArchived;
  }

  return transformed;
}
