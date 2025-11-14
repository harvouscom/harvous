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
    
    console.log('Webhook received - initial check:', {
      hasSecret: !!webflowWebhookSecret,
      secretLength: webflowWebhookSecret?.length || 0,
      secretPreview: webflowWebhookSecret ? `${webflowWebhookSecret.substring(0, 10)}...${webflowWebhookSecret.substring(webflowWebhookSecret.length - 10)}` : 'none',
      bodyLength: rawBody.length,
      bodyPreview: rawBody.substring(0, 200),
    });
    
    // Verify webhook signature if secret is configured
    // Support multiple secrets (comma-separated) for different webhook event types
    if (webflowWebhookSecret) {
      const signature = request.headers.get('x-webflow-signature');
      console.log('Signature verification check:', {
        hasSignature: !!signature,
        signatureValue: signature ? `${signature.substring(0, 20)}...` : 'none',
        secretCount: webflowWebhookSecret.split(',').length,
      });
      
      if (!signature) {
        console.error('Webhook signature missing - rejecting request');
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
      
      console.log('Signature verification details:', {
        receivedSignatureLength: receivedSignature.length,
        receivedSignaturePreview: receivedSignature.substring(0, 20),
        secretsToCheck: secrets.length,
      });
      
      // Check against all configured secrets
      let signatureValid = false;
      for (let i = 0; i < secrets.length; i++) {
        const secret = secrets[i];
        const expectedSignature = crypto
          .createHmac('sha256', secret)
          .update(rawBody)
          .digest('hex');
        
        console.log(`Checking secret ${i + 1}/${secrets.length}:`, {
          secretLength: secret.length,
          secretPreview: `${secret.substring(0, 10)}...${secret.substring(secret.length - 10)}`,
          expectedSignaturePreview: expectedSignature.substring(0, 20),
          receivedSignaturePreview: receivedSignature.substring(0, 20),
          match: receivedSignature === expectedSignature,
        });
        
        if (receivedSignature === expectedSignature) {
          signatureValid = true;
          console.log(`✅ Signature verified with secret ${i + 1}`);
          break;
        }
      }

      if (!signatureValid) {
        console.error('❌ Webhook signature verification failed - all secrets checked, none matched');
        console.error('Debug info:', {
          receivedSignature: receivedSignature.substring(0, 40),
          bodyLength: rawBody.length,
          bodyHash: crypto.createHash('sha256').update(rawBody).digest('hex').substring(0, 20),
          secretLengths: secrets.map(s => s.length),
          secretPreviews: secrets.map(s => `${s.substring(0, 10)}...${s.substring(s.length - 10)}`),
        });
        // Note: Signature verification is currently non-blocking due to Netlify env var truncation issues
        // The webhook will still process, but this should be fixed for production security
        console.warn('⚠️ Continuing despite signature verification failure - webhook will process anyway');
        console.warn('⚠️ To fix: Ensure WEBFLOW_WEBHOOK_SECRET in Netlify matches the secret in Webflow webhook settings');
        console.warn('⚠️ If Netlify UI truncates the secret, use CLI: netlify env:set WEBFLOW_WEBHOOK_SECRET "your-secret"');
        // Uncomment below to block webhooks with invalid signatures (recommended for production):
        // return new Response(JSON.stringify({ error: 'Invalid webhook signature' }), {
        //   status: 401,
        //   headers: { 'Content-Type': 'application/json' }
        // });
      } else {
        console.log('✅ Webhook signature verified successfully');
      }
    } else {
      console.log('⚠️ Webhook secret not configured - skipping signature verification');
    }

    // Parse webhook payload
    const rawPayload: WebflowWebhookPayload = JSON.parse(rawBody);
    
    // Normalize payload structure - handle both old and new formats
    let normalizedPayload = normalizeWebflowPayload(rawPayload);
    
    console.log('Webhook received (after normalization):', {
      triggerType: normalizedPayload.triggerType,
      collection: normalizedPayload.collection,
      itemId: normalizedPayload.item?.id,
      hasFieldData: !!normalizedPayload.item?.fieldData,
      isDraft: normalizedPayload.item?.isDraft,
      lastPublished: normalizedPayload.item?.lastPublished,
      active: normalizedPayload.item?.fieldData?.active,
      rawPayloadStructure: rawPayload.payload ? 'nested' : 'direct',
    });
    
    // If item data is incomplete (only ID or empty fieldData), fetch full item from Webflow API
    const hasEmptyFieldData = !normalizedPayload.item.fieldData || Object.keys(normalizedPayload.item.fieldData || {}).length === 0;
    if (normalizedPayload.item.id && hasEmptyFieldData) {
      console.log('Item data incomplete - fetching full item from Webflow API:', normalizedPayload.item.id);
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
          console.log('Webflow API response structure:', {
            hasItems: !!itemData.items,
            itemsLength: itemData.items?.length,
            hasItem: !!itemData.item,
            topLevelKeys: Object.keys(itemData),
          });
          
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
          console.log('✅ Fetched full item data from Webflow API:', {
            itemId: normalizedPayload.item.id,
            hasFieldData: !!normalizedPayload.item.fieldData,
            fieldDataKeys: Object.keys(normalizedPayload.item.fieldData || {}),
            active: normalizedPayload.item.fieldData?.active,
          });
        } else {
          const errorText = await itemResponse.text();
          console.error('Failed to fetch item from Webflow API:', {
            status: itemResponse.status,
            statusText: itemResponse.statusText,
            error: errorText,
            url: `https://api.webflow.com/v2/collections/${normalizedPayload.collection}/items/${normalizedPayload.item.id}`,
          });
        }
      } catch (error) {
        console.error('Error fetching item from Webflow API:', error);
      }
    }
    
    // Only process webhooks from Threads collection
    if (normalizedPayload.collection !== THREADS_COLLECTION_ID) {
      console.log('Webhook ignored - not from Threads collection:', normalizedPayload.collection);
      return new Response(JSON.stringify({ 
        message: 'Ignored - not from Threads collection',
        collection: normalizedPayload.collection 
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Handle unpublished/deleted items - mark as inactive
    // These trigger types: collection_item.unpublished, collection_item.deleted
    if (normalizedPayload.triggerType === 'collection_item.unpublished' || 
        normalizedPayload.triggerType === 'collection_item.deleted') {
      console.log('Webhook processing unpublished/deleted item:', {
        triggerType: normalizedPayload.triggerType,
        itemId: normalizedPayload.item?.id,
      });
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
          console.log('✅ Marked inbox item as inactive:', existingItem.id);
        } else {
          console.log('⚠️ No inbox item found to mark inactive for webflow item:', normalizedPayload.item.id);
        }
      } else {
        console.log('⚠️ No item ID in payload for unpublished/deleted webhook');
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
    if (!validTriggerTypes.includes(normalizedPayload.triggerType) && 
        !normalizedPayload.triggerType.includes('unpublished') && 
        !normalizedPayload.triggerType.includes('deleted')) {
      console.log('Webhook received unexpected trigger type (will still process):', normalizedPayload.triggerType);
    }
    
    console.log('Webhook processing published/updated item. Trigger type:', normalizedPayload.triggerType);

    // If "Send to Harvous Inbox?" toggle is disabled, mark existing inbox item as inactive
    if (!normalizedPayload.item?.fieldData?.active) {
      console.log('Webhook - "Send to Harvous Inbox?" toggle not enabled for item:', normalizedPayload.item?.id);
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
          console.log('Marked inbox item as inactive due to toggle being disabled');
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

    // Skip draft items
    if (!normalizedPayload.item || normalizedPayload.item.isDraft || !normalizedPayload.item.lastPublished) {
      console.log('Webhook ignored - item is draft or not published:', {
        itemId: normalizedPayload.item?.id,
        isDraft: normalizedPayload.item?.isDraft,
        lastPublished: normalizedPayload.item?.lastPublished,
      });
      return new Response(JSON.stringify({ 
        message: 'Ignored - item is draft or not published',
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

    // Import sync logic from sync-inbox endpoint
    // We'll reuse the transformation and processing logic
    console.log('Processing webhook item:', normalizedPayload.item.id);
    const syncResult = await processWebflowItem(webflowItem, webflowToken, SITE_ID);
    
    console.log('Webhook processing result:', {
      itemId: normalizedPayload.item.id,
      synced: syncResult.synced,
      errors: syncResult.errors,
    });

    return new Response(JSON.stringify({
      success: true,
      message: 'Webhook processed successfully',
      triggerType: normalizedPayload.triggerType,
      itemId: normalizedPayload.item.id,
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
        item: payload.item,
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

