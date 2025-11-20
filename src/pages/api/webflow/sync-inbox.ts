import type { APIRoute } from 'astro';
import { db, InboxItems, InboxItemNotes, UserInboxItems, UserMetadata, eq, and } from 'astro:db';

interface WebflowItem {
  _id: string;
  'content-type'?: string;
  'content-type-slug'?: string;
  title?: string;
  subtitle?: string;
  content?: string;
  'image-url'?: string | { url: string };
  color?: string;
  'thread-type'?: string; // Thread type from CMS (e.g., 'Default')
  'target-audience'?: string;
  'is-active'?: boolean;
  'thread-notes'?: string[]; // Array of referenced note IDs
  'is-draft'?: boolean;
  'published-on'?: string;
}

// Webflow native API format
interface WebflowNativeItem {
  id: string;
  fieldData?: {
    name?: string;
    content?: string;
    'color-2'?: string; // Reference to color item
    notes?: string[]; // MultiReference to notes
    image?: string | { url: string };
    active?: boolean; // Switch field: "Send to Harvous Inbox?"
    [key: string]: any;
  };
  isDraft?: boolean;
  lastPublished?: string;
  isArchived?: boolean;
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
 * 3. Automatically via Webflow webhooks (see /api/webflow/webhook.ts)
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

    // Threads collection ID: 690ed2f0edd9bab40a4eb397
    // Notes collection ID: 690ed346b73a1ff102283b32
    // Only sync from Threads collection - skip Notes collection entirely
    if (collectionId === '690ed346b73a1ff102283b32') {
      return new Response(JSON.stringify({ 
        error: 'Notes collection sync is not supported. Only Threads collection can be synced to inbox.' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // If items are provided directly, use them
    // Otherwise, fetch from Webflow API
    let webflowNativeItems: WebflowNativeItem[] = items || [];

    if (!items && collectionId && siteId) {
      // Fetch from Webflow CDN API for better performance (cached, 2-5min delay acceptable for manual syncs)
      const response = await fetch(
        `https://api-cdn.webflow.com/v2/collections/${collectionId}/items`,
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
      webflowNativeItems = data.items || [];
    }

    // Transform Webflow native format to expected format
    // Only process threads - filter by "Push to Harvous Inbox?" toggle
    const webflowItems: WebflowItem[] = await Promise.all(
      webflowNativeItems
        .filter((item) => {
          // Only sync threads where "Send to Harvous Inbox?" toggle is enabled
          return item.fieldData?.active === true;
        })
        .map(async (item) => {
          const transformed: WebflowItem = {
            _id: item.id,
            'is-draft': item.isDraft || false,
            'published-on': item.lastPublished || undefined,
          };

          // All items from Threads collection are threads
          transformed['content-type'] = 'thread';

          if (item.fieldData) {
            // Map name to title
            transformed.title = item.fieldData.name;

            // Map content - check multiple possible field names
            // Webflow rich text fields might be stored with different names
            // Also handle if content is an object (Webflow v2 API sometimes returns rich text as objects)
            let rawContent = item.fieldData.content 
              || item.fieldData['Content'] 
              || item.fieldData['content-html']
              || item.fieldData['content-html-2']
              || item.fieldData.description
              || item.fieldData.body
              || null;
            
            // If content is an object, extract HTML from it
            if (rawContent && typeof rawContent === 'object') {
              // Webflow v2 API might return rich text as { html: "...", plainText: "..." }
              rawContent = rawContent.html || rawContent.richText || rawContent.content || JSON.stringify(rawContent);
            }
            
            transformed.content = rawContent;
            
            // Debug: log fieldData to see what's available
            if (!transformed.content) {
              console.log('No content found for item:', item.id);
              console.log('Available fields:', Object.keys(item.fieldData || {}));
              // Log all field values to help debug
              Object.keys(item.fieldData || {}).forEach(key => {
                const value = item.fieldData[key];
                if (typeof value === 'string' && value.length > 0) {
                  console.log(`Field "${key}":`, value.substring(0, 100) + (value.length > 100 ? '...' : ''));
                }
              });
            } else {
              console.log('Content found for item:', item.id, 'Length:', transformed.content?.length || 0);
              // Log first 200 chars to see structure
              console.log('Content preview:', transformed.content?.substring(0, 200) || 'empty');
            }

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

            // Handle thread type - check multiple possible field name formats
            // Webflow option fields store the selected option's ID or slug
            // Since "Default" is the only option, if the field has any value, it's "Default"
            let threadTypeField = null;
            
            // Check common field name variations
            if (item.fieldData['thread-type']) {
              threadTypeField = item.fieldData['thread-type'];
            } else if (item.fieldData.threadType) {
              threadTypeField = item.fieldData.threadType;
            } else if (item.fieldData['Thread Type']) {
              threadTypeField = item.fieldData['Thread Type'];
            } else {
              // Try to find any field that might be thread type by checking all fieldData keys
              const fieldKeys = Object.keys(item.fieldData);
              const threadTypeKey = fieldKeys.find(key => 
                key.toLowerCase().includes('thread') && key.toLowerCase().includes('type')
              );
              if (threadTypeKey) {
                threadTypeField = item.fieldData[threadTypeKey];
              }
            }
            
            // For option fields: if field has a value (ID, slug, or name), set to "Default"
            // since that's the only option available
            if (threadTypeField) {
              // Check if it's an object with a name property
              if (typeof threadTypeField === 'object' && threadTypeField !== null) {
                const optionName = threadTypeField.name || threadTypeField.slug;
                // If it has a name and it's "Default", use it; otherwise default to "Default"
                transformed['thread-type'] = (optionName && optionName.toLowerCase() === 'default') ? 'Default' : 'Default';
              } else if (typeof threadTypeField === 'string' && threadTypeField.trim() !== '') {
                // If it's a string (ID or name), check if it's already "Default", otherwise set to "Default"
                // Since there's only one option, any value means "Default"
                transformed['thread-type'] = (threadTypeField.toLowerCase() === 'default') ? 'Default' : 'Default';
              }
            }

            // Set target-audience - all threads with "Send to Harvous Inbox" enabled go to all users
            transformed['target-audience'] = 'all_users';

            // Set is-active based on archived status
            transformed['is-active'] = !item.isArchived;
          }

          return transformed;
        })
    );

    if (!webflowItems || webflowItems.length === 0) {
      return new Response(JSON.stringify({ error: 'No items provided' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const syncedItems: string[] = [];
    const errors: string[] = [];
    const verificationResults = {
      checked: 0,
      markedInactive: 0,
      reactivated: 0,
      details: [] as string[],
    };

    // First, verify all existing inbox items against Webflow
    // Mark as inactive if they're no longer published, deleted, or archived
    try {
      const allInboxItems = await db.select().from(InboxItems).all();
      console.log(`Verifying ${allInboxItems.length} existing inbox items against Webflow...`);
      verificationResults.checked = allInboxItems.length;
      
      for (const inboxItem of allInboxItems) {
        if (!inboxItem.webflowItemId) continue;
        
        try {
          const verifyResponse = await fetch(
            `https://api.webflow.com/v2/collections/${collectionId}/items/${inboxItem.webflowItemId}`,
            {
              headers: {
                'Authorization': `Bearer ${webflowToken}`,
                'Accept-Version': '1.0.0',
              }
            }
          );
          
          if (verifyResponse.status === 404) {
            // Item was deleted - mark as inactive
            if (inboxItem.isActive) {
              await db
                .update(InboxItems)
                .set({ isActive: false, updatedAt: new Date() })
                .where(eq(InboxItems.id, inboxItem.id));
              verificationResults.markedInactive++;
              verificationResults.details.push(`Deleted: ${inboxItem.title || inboxItem.id}`);
              console.log(`Marked deleted item as inactive: ${inboxItem.id} (${inboxItem.webflowItemId})`);
            }
          } else if (verifyResponse.ok) {
            const itemData = await verifyResponse.json();
            const fullItem = itemData.items?.[0] || itemData.item || itemData;
            
            // Check if item is draft, archived, or toggle is off
            const isDraft = fullItem.isDraft || !fullItem.lastPublished;
            const isArchived = fullItem.isArchived || false;
            const toggleOff = fullItem.fieldData?.active !== true;
            
            if ((isDraft || isArchived || toggleOff) && inboxItem.isActive) {
              await db
                .update(InboxItems)
                .set({ isActive: false, updatedAt: new Date() })
                .where(eq(InboxItems.id, inboxItem.id));
              verificationResults.markedInactive++;
              const reason = isDraft ? 'draft' : isArchived ? 'archived' : 'toggle off';
              verificationResults.details.push(`${reason}: ${inboxItem.title || inboxItem.id}`);
              console.log(`Marked item as inactive: ${inboxItem.id} (draft: ${isDraft}, archived: ${isArchived}, toggle: ${!toggleOff})`);
            } else if (!isDraft && !isArchived && toggleOff === false && !inboxItem.isActive) {
              // Item is now published and active - reactivate it
              await db
                .update(InboxItems)
                .set({ isActive: true, updatedAt: new Date() })
                .where(eq(InboxItems.id, inboxItem.id));
              verificationResults.reactivated++;
              verificationResults.details.push(`Reactivated: ${inboxItem.title || inboxItem.id}`);
              console.log(`Reactivated item: ${inboxItem.id}`);
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
        // Skip draft items
        if (webflowItem['is-draft'] || !webflowItem['published-on']) {
          continue;
        }

        const webflowItemId = webflowItem._id;
        const contentType = webflowItem['content-type'] || 'thread';
        
        // Only threads are supported now
        if (contentType !== 'thread') {
          errors.push(`Invalid content type for item ${webflowItemId}: ${contentType}. Only threads are supported.`);
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
          threadType: webflowItem['thread-type'] || null,
          targetAudience: webflowItem['target-audience'] || 'all_users', // Default to all_users if not set
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

          const threadNoteIds = webflowItem['thread-notes'];
          
          // Fetch note items from Webflow
          const notesCollectionId = '690ed346b73a1ff102283b32';
          const noteItems = await Promise.all(
            threadNoteIds.map(async (noteId, index) => {
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

        syncedItems.push(inboxItemId);

        // Auto-assign to users based on targetAudience
        // Always assign if targetAudience is 'all_users'
        // This ensures items are assigned even if UserInboxItems entries were deleted
        const targetAudience = inboxItemData.targetAudience || 'all_users';
        if (targetAudience === 'all_users') {
          try {
            // Get all existing users
            const allUsers = await db.select().from(UserMetadata).all();
            
            let assignedCount = 0;
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
                assignedCount++;
              }
            }
            console.log(`✅ Assigned inbox item ${inboxItemId} to ${assignedCount} user(s) (${allUsers.length} total users)`);
          } catch (assignError: any) {
            console.error(`❌ Error assigning inbox item ${inboxItemId} to users:`, assignError);
            // Don't fail the entire sync if assignment fails - log and continue
          }
        } else {
          console.log(`⚠️ Skipping assignment for inbox item ${inboxItemId} - targetAudience: ${targetAudience}`);
        }

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

    // Check if request wants HTML (browser visit) or JSON
    const acceptHeader = request.headers.get('accept') || '';
    if (acceptHeader.includes('text/html')) {
      // Return HTML for browser viewing
      const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Inbox Sync Complete</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }
    .success { color: #059669; }
    .info { background: #f0f9ff; padding: 15px; border-radius: 8px; margin: 20px 0; }
    .details { background: #f9fafb; padding: 10px; border-radius: 6px; margin: 10px 0; }
    ul { margin: 10px 0; padding-left: 20px; }
    .error { color: #dc2626; }
  </style>
</head>
<body>
  <h1 class="success">✅ Inbox Sync Complete</h1>
  <div class="info">
    <h2>Summary</h2>
    <p><strong>Synced:</strong> ${result.synced} item(s)</p>
    <p><strong>Verified:</strong> ${result.verification.checked} existing items</p>
    <p><strong>Marked Inactive:</strong> ${result.verification.markedInactive} item(s)</p>
    <p><strong>Reactivated:</strong> ${result.verification.reactivated} item(s)</p>
  </div>
  ${result.verification.details.length > 0 ? `
    <div class="details">
      <h3>Details:</h3>
      <ul>
        ${result.verification.details.map(d => `<li>${d}</li>`).join('')}
      </ul>
    </div>
  ` : ''}
  ${result.errors && result.errors.length > 0 ? `
    <div class="error">
      <h3>Errors:</h3>
      <ul>
        ${result.errors.map(e => `<li>${e}</li>`).join('')}
      </ul>
    </div>
  ` : ''}
  <p><a href="/">← Back to Dashboard</a></p>
</body>
</html>
      `;
      return new Response(html, {
        status: 200,
        headers: { 'Content-Type': 'text/html' }
      });
    }

    // Return JSON for API calls
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Error syncing inbox items:', error);
    console.error('Error stack:', error.stack);
    console.error('Error details:', JSON.stringify(error, null, 2));
    return new Response(JSON.stringify({ 
      error: 'Failed to sync inbox items',
      details: error.message,
      stack: error.stack
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
export const GET: APIRoute = async ({ url, request }) => {
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

    // Only allow syncing from Threads collection - reject Notes collection
    if (collectionId === '690ed346b73a1ff102283b32') {
      return new Response(JSON.stringify({ 
        error: 'Notes collection sync is not supported. Only Threads collection can be synced to inbox.' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Fetch from Webflow CDN API for better performance (cached, 2-5min delay acceptable for manual syncs)
    const response = await fetch(
      `https://api-cdn.webflow.com/v2/collections/${collectionId}/items`,
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
    // Pass items in Webflow native format - POST will transform them
    // Preserve Accept header from original request so HTML can be returned for browser visits
    const acceptHeader = request.headers.get('accept') || '';
    const postRequest = new Request(url.toString(), {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': acceptHeader,
      },
      body: JSON.stringify({ items, collectionId, siteId }),
    });

    return POST({ request: postRequest } as any);

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

