// @ts-ignore - React hooks are available, this is a linter cache issue
import React, { useEffect } from 'react';

interface PendingNoteData {
  title: string;
  content: string;
  threadId: string;
  noteType: 'default' | 'scripture' | 'resource';
  scriptureReference: string;
  scriptureVersion: string;
  resourceUrl: string;
  resourceMetadata: string | null;
  spaceId: string | null;
  timestamp: number;
}

export default function UpgradeSuccessHandler() {
  // Function to handle upgrade success check
  const handleUpgradeSuccess = () => {
    const urlParams = new URLSearchParams(window.location.search);
    const upgradeSuccess = urlParams.get('upgrade') === 'success' || urlParams.get('success') === 'true';
    const pendingNoteStr = sessionStorage.getItem('pendingNote');
    
    if (!pendingNoteStr && !upgradeSuccess) {
      return;
    }
    
    if (upgradeSuccess) {
      // Clean up URL
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete('upgrade');
      newUrl.searchParams.delete('success');
      window.history.replaceState({}, '', newUrl.toString());

      // Dispatch event to trigger status refresh
      window.dispatchEvent(new CustomEvent('subscriptionUpgraded'));
      
      if (!pendingNoteStr) {
        return;
      }
    }
    
    if (!pendingNoteStr) {
      return;
    }

    console.log('[UpgradeSuccessHandler] Found pending note in sessionStorage');

    let pendingNoteData: PendingNoteData;
    try {
      pendingNoteData = JSON.parse(pendingNoteStr);
      
      // Validate required fields
      if (!pendingNoteData.threadId || !pendingNoteData.noteType) {
        throw new Error('Invalid pending note data: missing required fields');
      }
      
      // Validate note type specific fields
      if (pendingNoteData.noteType === 'scripture' && !pendingNoteData.scriptureReference) {
        throw new Error('Invalid pending note data: missing scripture reference');
      }
      if (pendingNoteData.noteType === 'resource' && !pendingNoteData.resourceUrl) {
        throw new Error('Invalid pending note data: missing resource URL');
      }
    } catch (error) {
      console.error('[UpgradeSuccessHandler] Failed to parse or validate pending note data:', error);
      sessionStorage.removeItem('pendingNote');
      return;
    }

    // Log pending note data
    console.log('[UpgradeSuccessHandler] ===== PENDING NOTE DATA =====');
    console.log('[UpgradeSuccessHandler] ThreadId:', pendingNoteData.threadId);
    console.log('[UpgradeSuccessHandler] Note Type:', pendingNoteData.noteType);
    console.log('[UpgradeSuccessHandler] Title:', pendingNoteData.noteType === 'default' ? pendingNoteData.title : (pendingNoteData.noteType === 'scripture' ? pendingNoteData.scriptureReference : pendingNoteData.resourceUrl));
    console.log('[UpgradeSuccessHandler] SpaceId:', pendingNoteData.spaceId || 'none');
    console.log('[UpgradeSuccessHandler] =============================');

    // Dispatch event - components will check status via API
    window.dispatchEvent(new CustomEvent('subscriptionUpgraded'));
  };

  useEffect(() => {
    // Run on initial mount
    handleUpgradeSuccess();
    
    // Also listen for View Transitions to handle subsequent visits
    document.addEventListener('app:route-change', handleUpgradeSuccess);
    
    return () => {
      document.removeEventListener('app:route-change', handleUpgradeSuccess);
    };
  }, []);

  // Component is completely silent - no UI
  return null;
}
