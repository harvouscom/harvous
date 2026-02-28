/**
 * Verify if an inbox item exists in Webflow and has "Send to Harvous Inbox?" enabled
 * 
 * @param webflowItemId - The Webflow item ID to verify
 * @param collectionId - The Webflow collection ID (defaults to Threads collection)
 * @returns Object with isValid boolean and reason string
 */
export async function verifyInboxItemInWebflow(
  webflowItemId: string,
  collectionId: string = '690ed2f0edd9bab40a4eb397'
): Promise<{ isValid: boolean; reason?: string }> {
  const webflowToken = process.env?.WEBFLOW_INBOX_API_TOKEN;
  
  if (!webflowToken) {
    // If no token, we can't verify - assume valid to avoid blocking user creation
    console.warn('Webflow API token not configured - skipping verification');
    return { isValid: true, reason: 'No API token configured' };
  }

  try {
    const verifyResponse = await fetch(
      `https://api.webflow.com/v2/collections/${collectionId}/items/${webflowItemId}`,
      {
        headers: {
          'Authorization': `Bearer ${webflowToken}`,
          'Accept-Version': '1.0.0',
        }
      }
    );
    
    if (verifyResponse.status === 404) {
      // Item was deleted - not valid
      return { isValid: false, reason: 'Item deleted in Webflow' };
    }
    
    if (!verifyResponse.ok) {
      // API error - log but don't block (graceful degradation)
      console.error(`Webflow API error verifying item ${webflowItemId}:`, verifyResponse.status, verifyResponse.statusText);
      return { isValid: true, reason: 'API error - assuming valid' };
    }

    const itemData = await verifyResponse.json();
    const fullItem = itemData.items?.[0] || itemData.item || itemData;
    
    // Check if item is draft, archived, or toggle is off
    const isDraft = fullItem.isDraft || !fullItem.lastPublished;
    const isArchived = fullItem.isArchived || false;
    const toggleOff = fullItem.fieldData?.active !== true;
    
    if (isDraft) {
      return { isValid: false, reason: 'Item is draft' };
    }
    
    if (isArchived) {
      return { isValid: false, reason: 'Item is archived' };
    }
    
    if (toggleOff) {
      return { isValid: false, reason: 'Toggle disabled' };
    }
    
    // Item exists, is published, not archived, and toggle is enabled
    return { isValid: true };
    
  } catch (error) {
    // Network or other error - log but don't block user creation
    console.error(`Error verifying Webflow item ${webflowItemId}:`, error);
    return { isValid: true, reason: 'Verification error - assuming valid' };
  }
}

