import React, { useEffect } from 'react';
import CardFeat from './CardFeat';

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
}

interface InboxItemsListProps {
  items: InboxItem[];
  onItemAdded?: () => void;
  onItemArchived?: () => void;
}

export default function InboxItemsList({ items, onItemAdded, onItemArchived }: InboxItemsListProps) {

  const handleItemClick = async (item: InboxItem, e: React.MouseEvent) => {
    e.preventDefault();

    try {
      // Fetch full item data with notes via API
      const response = await fetch(`/api/inbox/preview?inboxItemId=${item.id}`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to load preview');
      }

      const result = await response.json();
      if (result.success && result.item) {
        // Dispatch event to open preview panel/bottom sheet
        window.dispatchEvent(new CustomEvent('openInboxPreview', {
          detail: { item: result.item }
        }));
      }
    } catch (error) {
      console.error('Error loading preview:', error);
      alert('Failed to load preview. Please try again.');
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
          throw new Error(error.error || 'Failed to add to Harvous');
        }

        const result = await response.json();
        if (result.success) {
          if (onItemAdded) {
            onItemAdded();
          }
          // Close the preview panel
          window.dispatchEvent(new CustomEvent('closeInboxPreview'));
          // Reload page to refresh inbox
          window.location.reload();
        }
      } catch (error) {
        console.error('Error adding to Harvous:', error);
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
          const error = await response.json();
          throw new Error(error.error || 'Failed to archive');
        }

        const result = await response.json();
        if (result.success) {
          if (onItemArchived) {
            onItemArchived();
          }
          // Close the preview panel
          window.dispatchEvent(new CustomEvent('closeInboxPreview'));
          // Reload page to refresh inbox
          window.location.reload();
        }
      } catch (error) {
        console.error('Error archiving:', error);
        throw error;
      }
    };

    const handleInboxItemAddToHarvous = async (event: CustomEvent) => {
      const { inboxItemId } = event.detail;
      try {
        await handleAddToHarvous(inboxItemId);
      } catch (error) {
        console.error('Error adding to Harvous:', error);
      }
    };

    const handleInboxItemArchive = async (event: CustomEvent) => {
      const { inboxItemId } = event.detail;
      try {
        await handleArchive(inboxItemId);
      } catch (error) {
        console.error('Error archiving:', error);
      }
    };

    const handleInboxNoteAddToHarvous = async (event: CustomEvent) => {
      const { inboxItemNoteId } = event.detail;
      try {
        const response = await fetch('/api/inbox/add-note-to-harvous', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({ inboxItemNoteId }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Failed to add note to Harvous');
        }

        const result = await response.json();
        if (result.success) {
          if (onItemAdded) {
            onItemAdded();
          }
        }
      } catch (error) {
        console.error('Error adding note to Harvous:', error);
        alert('Failed to add note to your Harvous. Please try again.');
      }
    };

    window.addEventListener('inboxItemAddToHarvous', handleInboxItemAddToHarvous as EventListener);
    window.addEventListener('inboxItemArchive', handleInboxItemArchive as EventListener);
    window.addEventListener('inboxNoteAddToHarvous', handleInboxNoteAddToHarvous as EventListener);

    return () => {
      window.removeEventListener('inboxItemAddToHarvous', handleInboxItemAddToHarvous as EventListener);
      window.removeEventListener('inboxItemArchive', handleInboxItemArchive as EventListener);
      window.removeEventListener('inboxNoteAddToHarvous', handleInboxNoteAddToHarvous as EventListener);
    };
  }, [onItemAdded, onItemArchived]);

  return (
    <>
      <div className="flex gap-3 overflow-auto">
        {items.map((item, index) => (
          <div
            key={item.id}
            className="inbox-item-enter"
            style={{ animationDelay: `${index * 50}ms` }}
          >
            <a
              href="#"
              onClick={(e) => handleItemClick(item, e)}
              className="block transition-transform duration-200 hover:scale-[1.002] cursor-pointer"
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
              />
            </a>
          </div>
        ))}
      </div>
    </>
  );
}
