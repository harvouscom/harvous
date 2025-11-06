import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import ButtonSmall from './ButtonSmall';

interface InboxItemNote {
  id: string;
  title?: string;
  content: string;
  order: number;
}

interface InboxItem {
  id: string;
  contentType: 'thread' | 'note';
  title: string;
  subtitle?: string;
  content?: string;
  imageUrl?: string;
  color?: string;
  notes?: InboxItemNote[];
}

interface InboxItemPreviewProps {
  item: InboxItem;
  onClose: () => void;
  onAddToHarvous: (inboxItemId: string) => Promise<void>;
  onArchive: (inboxItemId: string) => Promise<void>;
}

export default function InboxItemPreview({
  item,
  onClose,
  onAddToHarvous,
  onArchive
}: InboxItemPreviewProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Prevent body scroll when modal is open
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  const handleAddToHarvous = async () => {
    setIsAdding(true);
    try {
      await onAddToHarvous(item.id);
      onClose();
    } catch (error) {
      console.error('Error adding to Harvous:', error);
      alert('Failed to add item to your Harvous. Please try again.');
    } finally {
      setIsAdding(false);
    }
  };

  const handleArchive = async () => {
    setIsArchiving(true);
    try {
      await onArchive(item.id);
      onClose();
    } catch (error) {
      console.error('Error archiving:', error);
      alert('Failed to archive item. Please try again.');
    } finally {
      setIsArchiving(false);
    }
  };

  // Helper to strip HTML and get plain text preview
  const stripHtml = (html: string): string => {
    if (!html) return '';
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  };

  // Render content as HTML (sanitized)
  const renderContent = (content: string) => {
    return { __html: content };
  };

  if (!mounted) return null;

  const modalContent = (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4"
      role="dialog"
      aria-modal="true"
      style={{
        paddingTop: 'max(1rem, env(safe-area-inset-top))',
        paddingBottom: 'max(1rem, env(safe-area-inset-bottom))'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="bg-white rounded-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-lg"
        onClick={(e) => e.stopPropagation()}
        style={{ pointerEvents: 'auto' }}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-[var(--color-deep-grey)] mb-2">
              {item.title}
            </h2>
            {item.subtitle && (
              <p className="text-lg text-[var(--color-pebble-grey)] mb-4">
                {item.subtitle}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="ml-4 p-2 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Close preview"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Image */}
        {item.imageUrl && (
          <div className="mb-6">
            <img
              src={item.imageUrl}
              alt={item.title}
              className="w-full h-auto rounded-lg"
            />
          </div>
        )}

        {/* Content */}
        {item.contentType === 'note' && item.content && (
          <div className="mb-6">
            <div
              className="prose max-w-none text-[var(--color-deep-grey)]"
              dangerouslySetInnerHTML={renderContent(item.content)}
            />
          </div>
        )}

        {/* Thread Notes */}
        {item.contentType === 'thread' && item.notes && item.notes.length > 0 && (
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-[var(--color-deep-grey)] mb-4">
              Notes in this thread:
            </h3>
            <div className="space-y-4">
              {item.notes
                .sort((a, b) => a.order - b.order)
                .map((note, index) => (
                  <div
                    key={note.id}
                    className="border-l-4 pl-4 py-2"
                    style={{
                      borderColor: item.color ? `var(--color-${item.color})` : 'var(--color-paper)'
                    }}
                  >
                    {note.title && (
                      <h4 className="font-semibold text-[var(--color-deep-grey)] mb-2">
                        {note.title}
                      </h4>
                    )}
                    <div
                      className="prose max-w-none text-[var(--color-pebble-grey)] text-sm"
                      dangerouslySetInnerHTML={renderContent(note.content)}
                    />
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Thread Content (if provided) */}
        {item.contentType === 'thread' && item.content && (
          <div className="mb-6">
            <div
              className="prose max-w-none text-[var(--color-deep-grey)]"
              dangerouslySetInnerHTML={renderContent(item.content)}
            />
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 justify-end pt-4 border-t border-gray-200">
          <ButtonSmall
            type="button"
            onClick={handleArchive}
            state="Secondary"
            disabled={isArchiving || isAdding}
          >
            {isArchiving ? 'Archiving...' : 'Archive'}
          </ButtonSmall>
          <ButtonSmall
            type="button"
            onClick={handleAddToHarvous}
            state="Default"
            disabled={isAdding || isArchiving}
          >
            {isAdding ? 'Adding...' : 'Add to Harvous'}
          </ButtonSmall>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : null;
}

