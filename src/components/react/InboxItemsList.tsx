import React, { useState } from 'react';
import InboxItemPreview from './InboxItemPreview';

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
}

interface InboxItemsListProps {
  items: InboxItem[];
  onItemAdded?: () => void;
  onItemArchived?: () => void;
}

export default function InboxItemsList({ items, onItemAdded, onItemArchived }: InboxItemsListProps) {
  const [previewItem, setPreviewItem] = useState<{ id: string; contentType: 'thread' | 'note' } | null>(null);
  const [previewData, setPreviewData] = useState<any>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  const handleItemClick = async (item: InboxItem, e: React.MouseEvent) => {
    e.preventDefault();
    setIsLoadingPreview(true);
    setPreviewItem({ id: item.id, contentType: item.type });

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
        setPreviewData(result.item);
      }
    } catch (error) {
      console.error('Error loading preview:', error);
      setPreviewItem(null);
      alert('Failed to load preview. Please try again.');
    } finally {
      setIsLoadingPreview(false);
    }
  };

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
        // Reload page to refresh inbox
        window.location.reload();
      }
    } catch (error) {
      console.error('Error archiving:', error);
      throw error;
    }
  };

  const handleClosePreview = () => {
    setPreviewItem(null);
    setPreviewData(null);
  };

  return (
    <>
      <div className="flex gap-3 overflow-auto">
        {items.map((item) => (
          <a
            key={item.id}
            href="#"
            onClick={(e) => handleItemClick(item, e)}
            className="block transition-transform duration-200 hover:scale-[1.002] cursor-pointer"
          >
            <div
              className="bg-white box-border flex flex-col gap-3 h-[180px] items-start justify-start max-w-[220px] overflow-clip pb-3 pt-2 px-2 relative rounded-2xl shrink-0 w-[220px]"
            >
              {/* Background area */}
              <div
                className={`basis-0 grow min-h-px min-w-px overflow-clip relative rounded-xl shrink-0 w-full ${
                  item.variant === 'Thread'
                    ? item.color
                      ? `bg-[var(--color-${item.color})]`
                      : 'bg-[#c3e4ff]'
                    : item.imageUrl
                    ? 'bg-center bg-cover bg-no-repeat'
                    : 'bg-[#f3f2ec]'
                }`}
                style={
                  item.imageUrl && item.variant === 'NoteImage'
                    ? { backgroundImage: `url('${item.imageUrl}')` }
                    : {}
                }
              >
                {/* Icon placeholder */}
                <div className="absolute left-3.5 size-5 top-[17px]">
                  {item.variant === 'Thread' ? (
                    <svg
                      className="block max-w-none size-full text-[#4a473d] opacity-20"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                    </svg>
                  ) : (
                    <svg
                      className="block max-w-none size-full text-[#4a473d] opacity-20"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z" />
                    </svg>
                  )}
                </div>
              </div>

              {/* Text content area */}
              <div className="box-border flex gap-6 items-start justify-start px-2 py-0 relative shrink-0 w-full">
                <div className="basis-0 flex flex-col gap-2 grow items-start justify-start leading-[0] min-h-px min-w-px relative self-stretch shrink-0">
                  <div className="flex flex-col font-bold justify-center overflow-ellipsis overflow-hidden relative shrink-0 text-[#4a473d] text-[18px] w-full">
                    <p className="leading-[1.2] overflow-hidden text-ellipsis whitespace-nowrap">
                      {item.title}
                    </p>
                  </div>
                  <div className="flex flex-col font-normal justify-center overflow-ellipsis overflow-hidden relative shrink-0 text-[#78766f] text-[12px] w-full">
                    <p className="leading-[1.3] overflow-hidden text-ellipsis whitespace-nowrap">
                      {item.content}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </a>
        ))}
      </div>

      {/* Preview Modal */}
      {previewItem && previewData && (
        <InboxItemPreview
          item={previewData}
          onClose={handleClosePreview}
          onAddToHarvous={handleAddToHarvous}
          onArchive={handleArchive}
        />
      )}

      {/* Loading overlay */}
      {isLoadingPreview && (
        <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-[99]">
          <div className="bg-white rounded-lg p-4">
            <p className="text-[var(--color-deep-grey)]">Loading preview...</p>
          </div>
        </div>
      )}
    </>
  );
}

