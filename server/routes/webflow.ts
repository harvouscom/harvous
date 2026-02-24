/**
 * Webflow routes — Hono port
 *
 * Endpoints:
 *   POST /api/webflow/sync-inbox
 *   GET  /api/webflow/sync-inbox
 *   POST /api/webflow/webhook
 */

import { Hono } from 'hono';
import {
  db,
  InboxItems,
  InboxItemNotes,
  UserInboxItems,
  UserMetadata,
  eq,
  and,
} from '../db';
import { nowISO } from '../db/dates';

const app = new Hono();

// ─── Interfaces ───────────────────────────────────────────────────────

interface WebflowItem {
  _id: string;
  'content-type'?: string;
  'content-type-slug'?: string;
  title?: string;
  subtitle?: string;
  content?: string;
  'image-url'?: string | { url: string };
  color?: string;
  'thread-type'?: string;
  'target-audience'?: string;
  'is-active'?: boolean;
  'thread-notes'?: string[];
  'is-draft'?: boolean;
  'published-on'?: string;
}

interface WebflowNativeItem {
  id: string;
  fieldData?: {
    name?: string;
    content?: string;
    'color-2'?: string;
    notes?: string[];
    image?: string | { url: string };
    active?: boolean;
    [key: string]: any;
  };
  isDraft?: boolean;
  lastPublished?: string;
  isArchived?: boolean;
}

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

// Color mapping from Webflow color names/slugs to Harvous color names
const COLOR_MAP: Record<string, string> = {
  'blue': 'blessed-blue',
  'yellow': 'graceful-gold',
  'orange': 'pleasant-peach',
  'pink': 'peaceful-pink',
  'purple': 'lovely-lavender',
  'green': 'mindful-mint',
  'paper': 'paper',
};

const THREADS_COLLECTION_ID = '690ed2f0edd9bab40a4eb397';
const SITE_ID = '68feb1d0933e97605f9790ca';

// ─── Helpers ──────────────────────────────────────────────────────────

/**
 * Transform Webflow native item to WebflowItem format
 */
async function transformWebflowItem(item: any, webflowToken: string): Promise<WebflowItem | null> {
  const transformed: any = {
    _id: item.id,
    'is-draft': item.isDraft || false,
    'published-on': item.lastPublished || undefined,
  };

  transformed['content-type'] = 'thread';

  if (item.fieldData) {
    transformed.title = item.fieldData.name;

    let rawContent = item.fieldData.content
      || item.fieldData['Content']
      || item.fieldData['content-html']
      || item.fieldData['content-html-2']
      || item.fieldData.description
      || item.fieldData.body
      || null;

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
            },
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
        transformed.color = 'blessed-blue';
      }
    }

    // Handle thread notes
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
      const threadTypeKey = fieldKeys.find((key) =>
        key.toLowerCase().includes('thread') && key.toLowerCase().includes('type')
      );
      if (threadTypeKey) {
        threadTypeField = item.fieldData[threadTypeKey];
      }
    }

    if (threadTypeField) {
      if (typeof threadTypeField === 'object' && threadTypeField !== null) {
        transformed['thread-type'] = 'Default';
      } else if (typeof threadTypeField === 'string' && threadTypeField.trim() !== '') {
        transformed['thread-type'] = 'Default';
      }
    }

    transformed['target-audience'] = 'all_users';
    transformed['is-active'] = !item.isArchived;
  }

  return transformed;
}

/**
 * Upsert an inbox item and its notes, then assign to users
 */
async function upsertInboxItem(webflowItem: WebflowItem, webflowToken: string): Promise<string> {
  const webflowItemId = webflowItem._id;

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

  if (existingItem) {
    await db.update(InboxItems)
      .set({
        webflowItemId,
        contentType: 'thread',
        title: webflowItem.title || 'Untitled',
        subtitle: webflowItem.subtitle || null,
        content: webflowItem.content || null,
        imageUrl: imageUrl || null,
        color: webflowItem.color || null,
        threadType: webflowItem['thread-type'] || null,
        targetAudience: webflowItem['target-audience'] || 'all_users',
        isActive: webflowItem['is-active'] !== false,
        updatedAt: nowISO(),
      })
      .where(eq(InboxItems.id, inboxItemId));
  } else {
    await db.insert(InboxItems).values({
      id: inboxItemId,
      webflowItemId,
      contentType: 'thread',
      title: webflowItem.title || 'Untitled',
      subtitle: webflowItem.subtitle || null,
      content: webflowItem.content || null,
      imageUrl: imageUrl || null,
      color: webflowItem.color || null,
      threadType: webflowItem['thread-type'] || null,
      targetAudience: webflowItem['target-audience'] || 'all_users',
      isActive: webflowItem['is-active'] !== false,
      createdAt: nowISO(),
      updatedAt: nowISO(),
    });
  }

  // Handle thread notes
  if (webflowItem['thread-notes'] && Array.isArray(webflowItem['thread-notes'])) {
    await db.delete(InboxItemNotes).where(eq(InboxItemNotes.inboxItemId, inboxItemId));

    const notesCollectionId = '690ed346b73a1ff102283b32';
    const noteItems = await Promise.all(
      webflowItem['thread-notes'].map(async (noteId: string, index: number) => {
        try {
          const noteResponse = await fetch(
            `https://api.webflow.com/v2/collections/${notesCollectionId}/items/${noteId}`,
            {
              headers: {
                'Authorization': `Bearer ${webflowToken}`,
                'Accept-Version': '1.0.0',
              },
            }
          );
          if (noteResponse.ok) {
            const noteData = await noteResponse.json();
            const note = noteData.items?.[0] || noteData;
            return { title: note.fieldData?.name || null, content: note.fieldData?.content || '', order: index };
          }
        } catch (error) {
          console.error(`Error fetching note ${noteId}:`, error);
        }
        return { title: null, content: '', order: index };
      })
    );

    for (let i = 0; i < noteItems.length; i++) {
      const note = noteItems[i];
      await db.insert(InboxItemNotes).values({
        id: `inbox_note_${Date.now()}_${i}_${Math.random().toString(36).substr(2, 9)}`,
        inboxItemId,
        title: note.title || null,
        content: note.content || '',
        order: note.order || i,
        createdAt: nowISO(),
      });
    }
  }

  // Auto-assign to users
  const targetAudience = webflowItem['target-audience'] || 'all_users';
  if (targetAudience === 'all_users') {
    try {
      const allUsers = await db.select().from(UserMetadata).all();
      for (const user of allUsers) {
        const existingUserInboxItem = await db.select().from(UserInboxItems)
          .where(and(eq(UserInboxItems.userId, user.userId), eq(UserInboxItems.inboxItemId, inboxItemId)))
          .get();
        if (!existingUserInboxItem) {
          await db.insert(UserInboxItems).values({
            id: `user_inbox_${user.userId}_${inboxItemId}_${Date.now()}`,
            userId: user.userId,
            inboxItemId,
            status: 'inbox',
            createdAt: nowISO(),
          });
        }
      }
    } catch (assignError: any) {
      console.error(`Error assigning inbox item ${inboxItemId} to users:`, assignError);
    }
  }

  return inboxItemId;
}

/**
 * Mark an inbox item as inactive by its Webflow ID
 */
async function markInactiveByWebflowId(webflowItemId: string): Promise<boolean> {
  const existingItem = await db
    .select()
    .from(InboxItems)
    .where(eq(InboxItems.webflowItemId, webflowItemId))
    .get();

  if (existingItem) {
    await db.update(InboxItems)
      .set({ isActive: false, updatedAt: nowISO() })
      .where(eq(InboxItems.id, existingItem.id));
    return true;
  }
  return false;
}

/**
 * Normalize webhook payload to handle both old and new Webflow webhook formats
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
    fieldData: Record<string, any>;
  };
} {
  if (rawPayload.payload) {
    const payload = rawPayload.payload;
    if (payload.item) {
      return {
        triggerType: rawPayload.triggerType,
        collection: payload.collectionId || rawPayload.collection || '',
        site: payload.siteId || rawPayload.site || rawPayload.siteId || '',
        item: {
          ...payload.item,
          cmsLocaleId: payload.item.cmsLocaleId || '',
          lastUpdated: payload.item.lastUpdated || new Date().toISOString(),
          createdOn: payload.item.createdOn || new Date().toISOString(),
          isArchived: payload.item.isArchived || false,
          isDraft: payload.item.isDraft || false,
          fieldData: payload.item.fieldData || {},
        },
      };
    } else if (payload.id) {
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
          fieldData: {} as any,
        },
      };
    }
  }

  if (rawPayload.item) {
    return {
      triggerType: rawPayload.triggerType,
      collection: rawPayload.collection || rawPayload.collectionId || '',
      site: rawPayload.site || rawPayload.siteId || '',
      item: rawPayload.item,
    };
  }

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
      fieldData: {} as any,
    },
  };
}

// ─── POST /api/webflow/sync-inbox ─────────────────────────────────────

async function handleSyncInbox(c: any, items?: any[], collectionId?: string, siteId?: string, hardRefresh?: boolean) {
  const webflowToken = process.env.WEBFLOW_INBOX_API_TOKEN;
  if (!webflowToken) {
    return c.json({ error: 'Webflow API token not configured' }, 500);
  }

  // Only sync from Threads collection
  if (collectionId === '690ed346b73a1ff102283b32') {
    return c.json({ error: 'Notes collection sync is not supported. Only Threads collection can be synced to inbox.' }, 400);
  }

  // HARD REFRESH: Clear all and re-sync
  if (hardRefresh === true) {
    try {
      const allUserInboxItems = await db.select().from(UserInboxItems).all();
      for (const userInboxItem of allUserInboxItems) {
        await db.delete(UserInboxItems).where(eq(UserInboxItems.id, userInboxItem.id));
      }
      const allInboxItems = await db.select().from(InboxItems).all();
      for (const inboxItem of allInboxItems) {
        await db.update(InboxItems).set({ isActive: false, updatedAt: nowISO() }).where(eq(InboxItems.id, inboxItem.id));
      }
    } catch (error) {
      console.error('Error during hard refresh cleanup:', error);
    }
  }

  let webflowNativeItems: WebflowNativeItem[] = items || [];

  if (!items && collectionId && siteId) {
    const response = await fetch(
      `https://api-cdn.webflow.com/v2/collections/${collectionId}/items`,
      {
        headers: {
          'Authorization': `Bearer ${webflowToken}`,
          'Accept-Version': '1.0.0',
        },
      }
    );
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Webflow API error:', errorText);
      return c.json({ error: 'Failed to fetch from Webflow API', details: errorText }, response.status as any);
    }
    const data = await response.json();
    webflowNativeItems = data.items || [];
  }

  // Transform and filter items
  const webflowItems: WebflowItem[] = await Promise.all(
    webflowNativeItems
      .filter((item) => item.fieldData?.active === true)
      .map(async (item) => {
        const transformed = await transformWebflowItem(
          { id: item.id, fieldData: item.fieldData, isDraft: item.isDraft, lastPublished: item.lastPublished, isArchived: item.isArchived },
          webflowToken
        );
        return transformed!;
      })
  );

  if (!webflowItems || webflowItems.length === 0) {
    return c.json({ error: 'No items provided' }, 400);
  }

  const syncedItems: string[] = [];
  const errors: string[] = [];
  const verificationResults = { checked: 0, markedInactive: 0, reactivated: 0, details: [] as string[] };

  // Verify existing inbox items against Webflow
  try {
    const allInboxItems = await db.select().from(InboxItems).all();
    verificationResults.checked = allInboxItems.length;

    for (const inboxItem of allInboxItems) {
      if (!inboxItem.webflowItemId) continue;
      try {
        const verifyResponse = await fetch(
          `https://api.webflow.com/v2/collections/${collectionId}/items/${inboxItem.webflowItemId}`,
          { headers: { 'Authorization': `Bearer ${webflowToken}`, 'Accept-Version': '1.0.0' } }
        );

        if (verifyResponse.status === 404) {
          if (inboxItem.isActive) {
            await db.update(InboxItems).set({ isActive: false, updatedAt: nowISO() }).where(eq(InboxItems.id, inboxItem.id));
            verificationResults.markedInactive++;
            verificationResults.details.push(`Deleted: ${inboxItem.title || inboxItem.id}`);
          }
        } else if (verifyResponse.ok) {
          const itemData = await verifyResponse.json();
          const fullItem = itemData.items?.[0] || itemData.item || itemData;
          const isDraft = fullItem.isDraft || !fullItem.lastPublished;
          const isArchived = fullItem.isArchived || false;
          const toggleOff = fullItem.fieldData?.active !== true;

          if ((isDraft || isArchived || toggleOff) && inboxItem.isActive) {
            await db.update(InboxItems).set({ isActive: false, updatedAt: nowISO() }).where(eq(InboxItems.id, inboxItem.id));
            verificationResults.markedInactive++;
            const reason = isDraft ? 'draft' : isArchived ? 'archived' : 'toggle off';
            verificationResults.details.push(`${reason}: ${inboxItem.title || inboxItem.id}`);
          } else if (!isDraft && !isArchived && !toggleOff && !inboxItem.isActive) {
            await db.update(InboxItems).set({ isActive: true, updatedAt: nowISO() }).where(eq(InboxItems.id, inboxItem.id));
            verificationResults.reactivated++;
            verificationResults.details.push(`Reactivated: ${inboxItem.title || inboxItem.id}`);
          }
        }
      } catch (error) {
        console.error(`Error verifying item ${inboxItem.id}:`, error);
      }
    }
  } catch (error) {
    console.error('Error during inbox verification:', error);
  }

  // Process each Webflow item
  for (const webflowItem of webflowItems) {
    try {
      if (webflowItem['is-draft'] || !webflowItem['published-on']) continue;
      if ((webflowItem['content-type'] || 'thread') !== 'thread') {
        errors.push(`Invalid content type for item ${webflowItem._id}. Only threads are supported.`);
        continue;
      }
      const inboxItemId = await upsertInboxItem(webflowItem, webflowToken);
      syncedItems.push(inboxItemId);
    } catch (error: any) {
      console.error(`Error syncing item ${webflowItem._id}:`, error);
      errors.push(`Failed to sync item ${webflowItem._id}: ${error.message}`);
    }
  }

  const result = {
    success: true,
    synced: syncedItems.length,
    items: syncedItems,
    verification: {
      checked: verificationResults.checked,
      markedInactive: verificationResults.markedInactive,
      reactivated: verificationResults.reactivated,
      details: verificationResults.details,
    },
    errors: errors.length > 0 ? errors : undefined,
    message: `Synced ${syncedItems.length} item(s). Verified ${verificationResults.checked} existing items: ${verificationResults.markedInactive} marked inactive, ${verificationResults.reactivated} reactivated.`,
  };

  // Check if request wants HTML or JSON
  const acceptHeader = c.req.header('accept') || '';
  if (acceptHeader.includes('text/html')) {
    const html = `<!DOCTYPE html><html><head><title>Inbox Sync Complete</title><style>body{font-family:system-ui,-apple-system,sans-serif;max-width:800px;margin:50px auto;padding:20px}.success{color:#059669}.info{background:#f0f9ff;padding:15px;border-radius:8px;margin:20px 0}.details{background:#f9fafb;padding:10px;border-radius:6px;margin:10px 0}ul{margin:10px 0;padding-left:20px}.error{color:#dc2626}</style></head><body><h1 class="success">Inbox Sync Complete</h1><div class="info"><h2>Summary</h2><p><strong>Synced:</strong> ${result.synced} item(s)</p><p><strong>Verified:</strong> ${result.verification.checked} existing items</p><p><strong>Marked Inactive:</strong> ${result.verification.markedInactive} item(s)</p><p><strong>Reactivated:</strong> ${result.verification.reactivated} item(s)</p></div>${result.verification.details.length > 0 ? `<div class="details"><h3>Details:</h3><ul>${result.verification.details.map((d) => `<li>${d}</li>`).join('')}</ul></div>` : ''}${result.errors && result.errors.length > 0 ? `<div class="error"><h3>Errors:</h3><ul>${result.errors.map((e) => `<li>${e}</li>`).join('')}</ul></div>` : ''}<p><a href="/">Back to Dashboard</a></p></body></html>`;
    return c.html(html);
  }

  return c.json(result);
}

app.post('/api/webflow/sync-inbox', async (c) => {
  try {
    const body = await c.req.json();
    const { items, collectionId, siteId, hardRefresh } = body;
    return handleSyncInbox(c, items, collectionId, siteId, hardRefresh);
  } catch (error: any) {
    console.error('Error syncing inbox items:', error);
    return c.json({ error: 'Failed to sync inbox items', details: error.message }, 500);
  }
});

app.get('/api/webflow/sync-inbox', async (c) => {
  try {
    const webflowToken = process.env.WEBFLOW_INBOX_API_TOKEN;
    if (!webflowToken) {
      return c.json({ error: 'Webflow API token not configured' }, 500);
    }

    const collectionId = c.req.query('collectionId');
    const siteId = c.req.query('siteId');
    const hardRefresh = c.req.query('hardRefresh') === 'true';

    if (!collectionId || !siteId) {
      return c.json({ error: 'collectionId and siteId are required' }, 400);
    }

    if (collectionId === '690ed346b73a1ff102283b32') {
      return c.json({ error: 'Notes collection sync is not supported. Only Threads collection can be synced to inbox.' }, 400);
    }

    // Fetch from Webflow CDN API
    const response = await fetch(
      `https://api-cdn.webflow.com/v2/collections/${collectionId}/items`,
      { headers: { 'Authorization': `Bearer ${webflowToken}`, 'Accept-Version': '1.0.0' } }
    );
    if (!response.ok) {
      const errorText = await response.text();
      return c.json({ error: 'Failed to fetch from Webflow API', details: errorText }, response.status as any);
    }

    const data = await response.json();
    const items = data.items || [];

    return handleSyncInbox(c, items, collectionId, siteId, hardRefresh);
  } catch (error: any) {
    console.error('Error fetching from Webflow:', error);
    return c.json({ error: 'Failed to fetch from Webflow', details: error.message }, 500);
  }
});

// ─── POST /api/webflow/webhook ────────────────────────────────────────

app.post('/api/webflow/webhook', async (c) => {
  try {
    const webflowToken = process.env.WEBFLOW_INBOX_API_TOKEN;
    const webflowWebhookSecret = process.env.WEBFLOW_WEBHOOK_SECRET;

    if (!webflowToken) {
      console.error('Webflow API token not configured');
      return c.json({ error: 'Webflow API token not configured' }, 500);
    }

    // Get raw body for signature verification
    const rawBody = await c.req.text();

    // Verify webhook signature if secret is configured
    if (webflowWebhookSecret) {
      const signature = c.req.header('x-webflow-signature');
      if (!signature) {
        console.error('Webhook signature missing');
        return c.json({ error: 'Missing webhook signature' }, 401);
      }

      const secrets = webflowWebhookSecret.split(',').map((s) => s.trim()).filter((s) => s);
      const crypto = await import('crypto');
      const receivedSignature = signature.replace('sha256=', '');

      let signatureValid = false;
      for (const secret of secrets) {
        const expectedSignature = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
        if (receivedSignature === expectedSignature) {
          signatureValid = true;
          break;
        }
      }

      if (!signatureValid) {
        console.error('Webhook signature verification failed');
        // Note: non-blocking for now due to env var truncation issues
      }
    }

    // Parse webhook payload
    let rawPayload: WebflowWebhookPayload;
    try {
      rawPayload = JSON.parse(rawBody);
    } catch (parseError: any) {
      console.error('Failed to parse webhook payload:', parseError.message);
      return c.json({ error: 'Invalid JSON payload', details: parseError.message }, 400);
    }

    let normalizedPayload = normalizeWebflowPayload(rawPayload);

    // If item data is incomplete, fetch full item from Webflow API
    const hasEmptyFieldData = !normalizedPayload.item.fieldData || Object.keys(normalizedPayload.item.fieldData || {}).length === 0;
    if (normalizedPayload.item.id && hasEmptyFieldData) {
      try {
        const itemResponse = await fetch(
          `https://api.webflow.com/v2/collections/${normalizedPayload.collection}/items/${normalizedPayload.item.id}`,
          { headers: { 'Authorization': `Bearer ${webflowToken}`, 'Accept-Version': '1.0.0' } }
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
          const found = await markInactiveByWebflowId(normalizedPayload.item.id);
          return c.json({ message: 'Item deleted - marked as inactive', itemId: normalizedPayload.item.id, found });
        } else {
          console.error('Failed to fetch item from Webflow API:', itemResponse.status);
        }
      } catch (error) {
        console.error('Error fetching item from Webflow API:', error);
      }
    }

    // Only process webhooks from Threads collection
    if (normalizedPayload.collection !== THREADS_COLLECTION_ID) {
      return c.json({ message: 'Ignored - not from Threads collection', collection: normalizedPayload.collection });
    }

    // Handle unpublished/deleted items
    if (normalizedPayload.triggerType === 'collection_item.unpublished' ||
        normalizedPayload.triggerType === 'collection_item.deleted') {
      if (normalizedPayload.item?.id) {
        await markInactiveByWebflowId(normalizedPayload.item.id);
      }
      return c.json({
        message: 'Item marked as inactive',
        triggerType: normalizedPayload.triggerType,
        itemId: normalizedPayload.item?.id,
      });
    }

    // Check if item is archived
    if (normalizedPayload.item?.isArchived) {
      if (normalizedPayload.item.id) {
        await markInactiveByWebflowId(normalizedPayload.item.id);
      }
      return c.json({ message: 'Item archived - marked as inactive', itemId: normalizedPayload.item?.id });
    }

    // If toggle is disabled, mark existing inbox item as inactive
    if (!normalizedPayload.item?.fieldData?.active) {
      if (normalizedPayload.item?.id) {
        await markInactiveByWebflowId(normalizedPayload.item.id);
      }
      return c.json({ message: 'Toggle not enabled - marked as inactive if existed', itemId: normalizedPayload.item?.id });
    }

    // Skip draft items
    if (!normalizedPayload.item || normalizedPayload.item.isDraft || !normalizedPayload.item.lastPublished) {
      if (normalizedPayload.item?.id) {
        const existingItem = await db.select().from(InboxItems).where(eq(InboxItems.webflowItemId, normalizedPayload.item.id)).get();
        if (existingItem && existingItem.isActive) {
          await db.update(InboxItems).set({ isActive: false, updatedAt: nowISO() }).where(eq(InboxItems.id, existingItem.id));
        }
      }
      return c.json({ message: 'Ignored - item is draft or not published', itemId: normalizedPayload.item?.id });
    }

    // Transform and process the webhook item
    const webflowItem = await transformWebflowItem(
      {
        id: normalizedPayload.item.id,
        fieldData: normalizedPayload.item.fieldData,
        isDraft: normalizedPayload.item.isDraft,
        lastPublished: normalizedPayload.item.lastPublished,
        isArchived: normalizedPayload.item.isArchived,
      },
      webflowToken
    );

    if (!webflowItem) {
      return c.json({ success: false, message: 'Failed to transform item' });
    }

    // Skip draft / unpublished after transform
    if (webflowItem['is-draft'] || !webflowItem['published-on']) {
      return c.json({ success: false, message: 'Item is draft or not published' });
    }

    const syncedId = await upsertInboxItem(webflowItem, webflowToken);

    return c.json({
      success: true,
      message: 'Webhook processed',
      triggerType: normalizedPayload.triggerType,
      itemId: normalizedPayload.item.id,
      synced: !!syncedId,
      note: syncedId ? 'Item synced to inbox' : 'Item processing failed',
    });
  } catch (error: any) {
    console.error('Error processing webhook:', error);
    return c.json({ error: 'Failed to process webhook', details: error.message }, 500);
  }
});

export default app;
