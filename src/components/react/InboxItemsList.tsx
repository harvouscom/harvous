import React, { useState, useEffect, useRef } from 'react';
import CardFeat from './CardFeat';
import { toast } from '@/utils/toast';
import { safeNavigate } from '@/utils/safe-navigate';
import { safeURL } from '@/utils/safe-url';

interface InboxItem {
  id: string;
  type: 'thread' | 'note';
  title: string;
  content: string;
  imageUrl?: string;
  variant: 'Thread' | 'Note' | 'NoteImage';
  threadId?: string;
  noteId?: string;
  color?: string;
  subtitle?: string;
  count?: number; // Note count for threads
  lastUpdated?: string; // Relative timestamp when item was made available to user
  threadType?: string; // Thread type from CMS (e.g., 'Default')
}

interface InboxItemsListProps {
  items: InboxItem[];
  onItemAdded?: () => void;
  onItemArchived?: (inboxItemId?: string) => void;
}

export default function InboxItemsList({ items, onItemAdded, onItemArchived }: InboxItemsListProps) {
  const [filteredItems, setFilteredItems] = useState<InboxItem[]>(items);
  // Track prefetched items to avoid duplicate prefetch requests
  const prefetchedItems = useRef<Set<string>>(new Set());

  // Update filtered items when items prop changes
  useEffect(() => {
    setFilteredItems(items);
  }, [items]);

  // Listen for deletion events to optimistically remove items
  useEffect(() => {
    const handleNoteDeleted = (event: CustomEvent) => {
      const { noteId } = event.detail;
      if (noteId) {
        setFilteredItems(prev => prev.filter(item => 
          // Check both item.id and item.noteId to handle different ID formats
          item.id !== noteId && item.noteId !== noteId
        ));
      }
    };

    const handleThreadDeleted = (event: CustomEvent) => {
      const { threadId } = event.detail;
      if (threadId) {
        setFilteredItems(prev => prev.filter(item => 
          // Check both item.id and item.threadId to handle different ID formats
          item.id !== threadId && item.threadId !== threadId
        ));
      }
    };

    window.addEventListener('noteDeleted', handleNoteDeleted as EventListener);
    window.addEventListener('threadDeleted', handleThreadDeleted as EventListener);

    return () => {
      window.removeEventListener('noteDeleted', handleNoteDeleted as EventListener);
      window.removeEventListener('threadDeleted', handleThreadDeleted as EventListener);
    };
  }, []);

  // Prefetch item data on hover for faster loading
  const handleItemHover = async (item: InboxItem) => {
    // Skip if already prefetched
    if (prefetchedItems.current.has(item.id)) {
      return;
    }

    // Mark as prefetched immediately to avoid duplicate requests
    prefetchedItems.current.add(item.id);

    // Prefetch in background (don't await - fire and forget)
    fetch(`/api/inbox/preview?inboxItemId=${item.id}`, {
      credentials: 'include',
    }).catch(() => {
      // On error, remove from prefetched set so we can retry on click
      prefetchedItems.current.delete(item.id);
    });
  };

  const handleItemClick = async (item: InboxItem, e: React.MouseEvent) => {
    e.preventDefault();

    // Show preview panel IMMEDIATELY with loading state for instant feedback
    window.dispatchEvent(new CustomEvent('openInboxPreview', {
      detail: { 
        item: {
          ...item,
          inboxItemId: item.id,
          isLoading: true,
          notes: [] // Empty notes array while loading
        }
      }
    }));

    try {
      // Fetch full item data with notes via API
      // If prefetched, browser cache should make this instant
      const response = await fetch(`/api/inbox/preview?inboxItemId=${item.id}`, {
        credentials: 'include',
      });

      if (!response.ok) {
        // Try to extract error message from response
        let errorMessage = 'Failed to load preview';
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch {
          // If response is not JSON, use default message
        }
        // Update panel with error state
        window.dispatchEvent(new CustomEvent('updateInboxPreview', {
          detail: { 
            item: {
              ...item,
              inboxItemId: item.id,
              isLoading: false,
              loadError: errorMessage,
              notes: []
            }
          }
        }));
        toast.error(errorMessage);
        return;
      }

      const result = await response.json();
      if (result.success && result.item) {
        // Update panel with full data
        window.dispatchEvent(new CustomEvent('updateInboxPreview', {
          detail: { item: { ...result.item, isLoading: false } }
        }));
      } else {
        window.dispatchEvent(new CustomEvent('updateInboxPreview', {
          detail: { 
            item: {
              ...item,
              inboxItemId: item.id,
              isLoading: false,
              loadError: 'Failed to load preview',
              notes: []
            }
          }
        }));
        toast.error('Failed to load preview');
      }
    } catch (error) {
      console.error('Error loading preview:', error);
      window.dispatchEvent(new CustomEvent('updateInboxPreview', {
        detail: { 
          item: {
            ...item,
            inboxItemId: item.id,
            isLoading: false,
            loadError: 'Failed to load preview',
            notes: []
          }
        }
      }));
      toast.error('Failed to load preview. Please try again.');
    }
  };

  // Listen for action events from panel/bottom sheet
  useEffect(() => {
    const handleAddToHarvous = async (inboxItemId: string) => {
      try {
        const response = await fetch('/api/inbox/add-to-harvous', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({ inboxItemId }),
        });

        if (!response.ok) {
          const error = await response.json();
          const errorMessage = error.error || 'Failed to add to Harvous';
          toast.error(errorMessage);
          throw new Error(errorMessage);
        }

        const result = await response.json();
        if (result.success) {
          if (onItemAdded) {
            onItemAdded();
          }
          // Close the preview panel
          window.dispatchEvent(new CustomEvent('closeInboxPreview'));
          // Navigate with URL-based toast using View Transitions
          const currentUrl = safeURL(window.location.href);
          if (currentUrl) {
            currentUrl.searchParams.set('toast', 'success');
            currentUrl.searchParams.set('message', encodeURIComponent('Added to Harvous'));
            safeNavigate(currentUrl.pathname + currentUrl.search, { history: 'replace' });
          }
        }
      } catch (error) {
        console.error('Error adding to Harvous:', error);
        // Show toast for network errors (API errors already show toast before throwing)
        if (error instanceof TypeError) {
          toast.error('Failed to add to Harvous');
        }
        throw error;
      }
    };

    const handleArchive = async (inboxItemId: string) => {
      try {
        const response = await fetch('/api/inbox/archive', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({ inboxItemId }),
        });

        if (!response.ok) {
          let errorMessage = 'Failed to archive';
          try {
            const error = await response.json();
            errorMessage = error.error || errorMessage;
          } catch (parseError) {
            errorMessage = `Failed to archive (${response.status} ${response.statusText})`;
          }
          toast.error(errorMessage);
          throw new Error(errorMessage);
        }

        let result;
        try {
          result = await response.json();
        } catch (parseError) {
          toast.error('Failed to archive item - invalid response');
          throw new Error('Invalid response from server');
        }

        if (result.success) {
          // Close the preview panel
          window.dispatchEvent(new CustomEvent('closeInboxPreview'));
          
          // Show success toast
          const contentType = result.contentType || items.find(item => item.id === inboxItemId)?.type;
          const message = contentType === 'thread' 
            ? 'Thread moved to archive' 
            : contentType === 'note' 
            ? 'Note moved to archive' 
            : 'Item archived'; // Fallback if contentType not available
          toast.success(message);
          
          // Trigger callback for optimistic update (pass inboxItemId so parent can move item)
          if (onItemArchived) {
            onItemArchived(inboxItemId);
          } else {
            // If no callback, just reload to get fresh data
            window.location.reload();
          }
        } else {
          const errorMessage = result.error || result.message || 'Failed to archive item';
          toast.error(errorMessage);
          throw new Error(errorMessage);
        }
      } catch (error) {
        console.error('Error archiving:', error);
        // Show toast for network errors (API errors already show toast before throwing)
        if (error instanceof TypeError) {
          toast.error('Failed to archive item - network error');
        } else if (!(error instanceof Error && error.message.includes('Failed to archive'))) {
          // Only show generic error if we haven't already shown a specific error
          toast.error('Failed to archive item');
        }
        throw error;
      }
    };

    const handleUnarchive = async (inboxItemId: string) => {
      try {
        const response = await fetch('/api/inbox/unarchive', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({ inboxItemId }),
        });

        if (!response.ok) {
          const error = await response.json();
          const errorMessage = error.error || 'Failed to unarchive';
          toast.error(errorMessage);
          throw new Error(errorMessage);
        }

        const result = await response.json();
        if (result.success) {
          // Close the preview panel
          window.dispatchEvent(new CustomEvent('closeInboxPreview'));
          
          // Show success toast
          const contentType = result.contentType || items.find(item => item.id === inboxItemId)?.type;
          const message = contentType === 'thread' 
            ? 'Thread moved back to inbox' 
            : contentType === 'note' 
            ? 'Note moved back to inbox' 
            : 'Item unarchived'; // Fallback if contentType not available
          toast.success(message);
          
          // Trigger callback for optimistic update (pass inboxItemId so parent can move item)
          if (onItemArchived) {
            onItemArchived(inboxItemId);
          } else {
            // If no callback, just reload to get fresh data
            window.location.reload();
          }
        }
      } catch (error) {
        console.error('Error unarchiving:', error);
        // Show toast for network errors (API errors already show toast before throwing)
        if (error instanceof TypeError) {
          toast.error('Failed to unarchive item');
        }
        throw error;
      }
    };

    const handleInboxItemAddToHarvous = async (event: CustomEvent) => {
      const { inboxItemId } = event.detail;
      try {
        await handleAddToHarvous(inboxItemId);
      } catch (error) {
        // Error toast is already shown in handleAddToHarvous
        console.error('Error adding to Harvous:', error);
      }
    };

    const handleInboxItemArchive = async (event: CustomEvent) => {
      const { inboxItemId } = event.detail;
      try {
        await handleArchive(inboxItemId);
      } catch (error) {
        // Error toast is already shown in handleArchive
        console.error('Error archiving:', error);
      }
    };

    const handleInboxItemUnarchive = async (event: CustomEvent) => {
      const { inboxItemId } = event.detail;
      try {
        await handleUnarchive(inboxItemId);
      } catch (error) {
        // Error toast is already shown in handleUnarchive
        console.error('Error unarchiving:', error);
      }
    };

    window.addEventListener('inboxItemAddToHarvous', handleInboxItemAddToHarvous as unknown as EventListener);
    window.addEventListener('inboxItemArchive', handleInboxItemArchive as unknown as EventListener);
    window.addEventListener('inboxItemUnarchive', handleInboxItemUnarchive as unknown as EventListener);

    return () => {
      window.removeEventListener('inboxItemAddToHarvous', handleInboxItemAddToHarvous as unknown as EventListener);
      window.removeEventListener('inboxItemArchive', handleInboxItemArchive as unknown as EventListener);
      window.removeEventListener('inboxItemUnarchive', handleInboxItemUnarchive as unknown as EventListener);
    };
  }, [onItemAdded, onItemArchived, items]);

  return (
    <>
      <div className="flex gap-3 overflow-auto">
        {filteredItems.map((item, index) => (
          <div
            key={item.id}
            className="inbox-item-enter"
            style={{ animationDelay: `${index * 50}ms` }}
          >
            <a
              href="#"
              onClick={(e) => handleItemClick(item, e)}
              onMouseEnter={() => handleItemHover(item)}
              className="block transition-transform duration-200 hover:scale-[1.002] active:scale-[0.98] cursor-pointer"
            >
              <CardFeat
                variant={item.variant}
                title={item.title}
                content={item.content}
                imageUrl={item.imageUrl}
                count={item.count}
                color={item.color}
                isPrivate={true}
                lastUpdated={item.lastUpdated}
                threadType={item.threadType}
              />
            </a>
          </div>
        ))}
      </div>
    </>
  );
}
