import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import ButtonSmall from './ButtonSmall';
import CardNote from './CardNote';
import { getThreadTextColorCSS, THREAD_COLORS, type ThreadColor } from '@/utils/colors';

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
  onAddNoteToHarvous?: (inboxItemNoteId: string) => Promise<void>;
}

// Map color names to CSS variable names (handles both short and long names)
function getColorCSSVariable(colorName: string | undefined | null): string {
  if (!colorName) return "var(--color-paper)";
  
  const colorMap: Record<string, string> = {
    "blessed-blue": "blue",
    "graceful-gold": "yellow",
    "mindful-mint": "green",
    "pleasant-peach": "orange",
    "peaceful-pink": "pink",
    "lovely-lavender": "purple",
    "paper": "paper",
    "blue": "blue",
    "yellow": "yellow",
    "green": "green",
    "orange": "orange",
    "pink": "pink",
    "purple": "purple",
  };
  
  const mappedColor = colorMap[colorName.toLowerCase()] || "paper";
  return `var(--color-${mappedColor})`;
}

// Extract color name from CSS variable format (e.g., "var(--color-blue)" -> "blue")
function extractColorName(bgColor: string): ThreadColor | null {
  const match = bgColor.match(/--color-([a-z]+)/);
  if (match && THREAD_COLORS.includes(match[1] as ThreadColor)) {
    return match[1] as ThreadColor;
  }
  return null;
}

// Helper to strip HTML and get plain text preview (matches thread page logic)
function stripHtml(html: string): string {
  if (!html) return '';
  
  let text = html
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
    
  return text;
}

export default function InboxItemPreview({
  item,
  onClose,
  onAddToHarvous,
  onArchive,
  onAddNoteToHarvous
}: InboxItemPreviewProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [addingNoteIds, setAddingNoteIds] = useState<Set<string>>(new Set());
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

  const handleAddNoteToHarvous = async (inboxItemNoteId: string) => {
    if (!onAddNoteToHarvous) return;
    
    setAddingNoteIds(prev => new Set(prev).add(inboxItemNoteId));
    try {
      await onAddNoteToHarvous(inboxItemNoteId);
      // Don't close modal, just show success feedback
    } catch (error) {
      console.error('Error adding note to Harvous:', error);
      alert('Failed to add note to your Harvous. Please try again.');
    } finally {
      setAddingNoteIds(prev => {
        const next = new Set(prev);
        next.delete(inboxItemNoteId);
        return next;
      });
    }
  };

  if (!mounted) return null;

  // Get header background color
  const headerBgColor = item.color ? getColorCSSVariable(item.color) : "var(--color-paper)";
  const colorName = extractColorName(headerBgColor);
  const textColor = getThreadTextColorCSS(colorName);

  // Sort notes by order
  const sortedNotes = item.notes ? [...item.notes].sort((a, b) => a.order - b.order) : [];

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
        className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-hidden shadow-[0px_3px_20px_0px_rgba(120,118,111,0.1)] flex flex-col"
        onClick={(e) => e.stopPropagation()}
        style={{ pointerEvents: 'auto', height: '90vh' }}
      >
        {/* CardStack-like Header */}
        <div 
          className="box-border content-stretch flex gap-3 items-center justify-center leading-[0] mb-[-24px] not-italic pb-12 pt-6 px-6 relative shrink-0 w-full relative"
          style={{ 
            backgroundColor: headerBgColor, 
            color: textColor 
          }}
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute right-4 top-4 p-2 hover:bg-black hover:bg-opacity-10 rounded-lg transition-colors"
            aria-label="Close preview"
            style={{ color: textColor }}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Title */}
          <div className="basis-0 font-sans font-bold grow min-h-px min-w-px relative shrink-0 text-[24px] text-center">
            <p className="leading-[normal]">{item.title}</p>
          </div>
        </div>

        {/* CardStack-like Content Area - Fixed height with scrolling */}
        <div className="box-border content-stretch flex flex-col grow items-start justify-start mb-[-24px] min-h-0 overflow-clip relative shrink-0 w-full flex-1">
          <div className="bg-[var(--color-snow-white)] box-border content-stretch flex flex-col gap-3 grow items-start justify-start min-h-0 overflow-x-clip overflow-y-auto p-[12px] relative rounded-tl-[24px] rounded-tr-[24px] shrink-0 w-full">
            <div className="basis-0 grow min-h-px min-w-px shrink-0 w-full">
              {/* Single Note Content */}
              {item.contentType === 'note' && (
                <div className="flex flex-col gap-3">
                  <div className="content-item note-item">
                    <CardNote
                      title={item.title}
                      content={item.content ? stripHtml(item.content) : ""}
                      imageUrl={item.imageUrl}
                      noteType="default"
                    />
                  </div>
                  
                  {/* Actions for single note */}
                  <div className="flex gap-3 justify-end pt-2">
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
              )}

              {/* Thread with Notes */}
              {item.contentType === 'thread' && (
                <div className="flex flex-col gap-6">
                  {sortedNotes.length > 0 ? (
                    <div className="flex flex-col gap-3">
                      {sortedNotes.map((note, index) => {
                        const cleanContent = stripHtml(note.content);
                        const previewContent = cleanContent.substring(0, 150) + (cleanContent.length > 150 ? "..." : "");
                        const isAddingNote = addingNoteIds.has(note.id);
                        
                        return (
                          <div 
                            key={note.id} 
                            className="content-item note-item card-enter" 
                            style={{ animationDelay: `${index * 50}ms` }}
                          >
                            <div className="flex flex-col gap-2">
                              <CardNote
                                title={note.title || "Untitled Note"}
                                content={previewContent}
                                noteType="default"
                              />
                              
                              {/* Individual note actions */}
                              <div className="flex gap-2 justify-end">
                                <ButtonSmall
                                  type="button"
                                  onClick={() => handleAddNoteToHarvous(note.id)}
                                  state="Default"
                                  disabled={isAddingNote || isAdding || isArchiving}
                                >
                                  {isAddingNote ? 'Adding...' : 'Add to Harvous'}
                                </ButtonSmall>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <p className="text-[var(--color-pebble-grey)] text-lg">No notes found in this thread.</p>
                    </div>
                  )}

                  {/* Thread-level actions */}
                  <div className="flex gap-3 justify-end pt-2 border-t border-gray-200">
                    <ButtonSmall
                      type="button"
                      onClick={handleArchive}
                      state="Secondary"
                      disabled={isArchiving || isAdding}
                    >
                      {isArchiving ? 'Archiving...' : 'Archive Thread'}
                    </ButtonSmall>
                    <ButtonSmall
                      type="button"
                      onClick={handleAddToHarvous}
                      state="Default"
                      disabled={isAdding || isArchiving}
                    >
                      {isAdding ? 'Adding...' : 'Add All to Harvous'}
                    </ButtonSmall>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : null;
}
