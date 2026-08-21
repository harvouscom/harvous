import { colorTokenVar } from '@/utils/space-cover';
import React, { useState, useEffect, useRef } from 'react';
import ButtonSmall from './ButtonSmall';
import CardNote from './CardNote';
import SquareButton from './SquareButton';
import { getThreadTextColorCSS, THREAD_COLORS, type ThreadColor } from '@/utils/colors';
import { safeRenderHtml } from '@/utils/content-renderer';
import { stripHtml } from '@/utils/html-stripper';

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
  userStatus?: 'inbox' | 'archived' | 'added' | null;
  isLoading?: boolean;
  loadError?: string;
}

interface InboxItemPreviewPanelProps {
  item: InboxItem;
  onClose: () => void;
  onAddToHarvous: (inboxItemId: string) => Promise<void>;
  onArchive: (inboxItemId: string) => Promise<void>;
  onUnarchive?: (inboxItemId: string) => Promise<void>;
  inBottomSheet?: boolean;
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
  
  // Every value in the map above is a defined token today, so this is belt-and-braces — but
  // the map is the kind of thing a new hue gets added to, and `colorTokenVar` means a bad
  // entry degrades to paper instead of dropping the declaration and painting nothing.
  const mappedColor = colorMap[colorName.toLowerCase()] || 'paper';
  return colorTokenVar(mappedColor, 'paper');
}

// Extract color name from CSS variable format (e.g., "var(--color-blue)" -> "blue")
function extractColorName(bgColor: string): ThreadColor | null {
  const match = bgColor.match(/--color-([a-z]+)/);
  if (match && THREAD_COLORS.includes(match[1] as ThreadColor)) {
    return match[1] as ThreadColor;
  }
  return null;
}


// Helper to normalize HTML content - ensure paragraphs are properly formatted
function normalizeHtmlContent(html: string | null | undefined): string {
  // Ensure input is a string first
  if (html === null || html === undefined) return '';
  if (typeof html !== 'string') {
    console.warn('[normalizeHtmlContent] Non-string content received:', typeof html);
    return '';
  }
  
  // If content already has paragraph tags, return as-is (but clean up any issues)
  if (html.includes('<p>') || html.includes('<p ')) {
    // Ensure proper paragraph structure - fix any unclosed or malformed tags
    return html;
  }
  
  // Convert <div> tags to <p> tags (Webflow sometimes uses divs for paragraphs)
  let normalized = html.replace(/<div([^>]*)>/gi, '<p$1>').replace(/<\/div>/gi, '</p>');
  
  // If content has no HTML tags at all, split by line breaks and wrap in paragraphs
  if (!normalized.includes('<')) {
    // Split by double line breaks (paragraph breaks) or single line breaks
    const paragraphs = normalized
      .split(/\n\s*\n/) // Split on double line breaks first
      .flatMap(p => p.split(/\n/)) // Then split on single line breaks
      .map(p => p.trim())
      .filter(p => p.length > 0);
    
    if (paragraphs.length > 1) {
      return paragraphs.map(p => `<p>${p}</p>`).join('');
    } else if (paragraphs.length === 1) {
      return `<p>${paragraphs[0]}</p>`;
    }
    return normalized;
  }
  
  // If content has HTML but no paragraphs, try to convert <br> tags to paragraphs
  // First, handle double <br> tags as paragraph breaks
  normalized = normalized
    .replace(/(<br\s*\/?>\s*){2,}/gi, '</p><p>')
    .trim();
  
  // If we created paragraph breaks, ensure proper wrapping
  if (normalized.includes('</p><p>')) {
    if (!normalized.startsWith('<p')) {
      normalized = '<p>' + normalized;
    }
    if (!normalized.endsWith('</p>')) {
      normalized = normalized + '</p>';
    }
    return normalized;
  }
  
  // If still no paragraphs, wrap the whole thing
  if (!normalized.includes('<p')) {
    normalized = `<p>${normalized}</p>`;
  }
  
  return normalized;
}

export default function InboxItemPreviewPanel({
  item: initialItem,
  onClose,
  onAddToHarvous,
  onArchive,
  onUnarchive,
  inBottomSheet = false
}: InboxItemPreviewPanelProps) {
  // Use state so we can update the item when data loads
  const [item, setItem] = useState<InboxItem>(initialItem);
  const [isAdding, setIsAdding] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [isUnarchiving, setIsUnarchiving] = useState(false);
  
  // Track item ID in a ref to avoid stale closure issues
  const itemIdRef = useRef(initialItem.id);
  
  // Update ref when initialItem changes
  useEffect(() => {
    itemIdRef.current = initialItem.id;
  }, [initialItem.id]);
  
  // Listen for item updates (for optimistic loading pattern)
  // Use empty dependency array to set up listener on mount and avoid race condition
  // with lazy loading - the event might fire before component mounts with [item.id] dependency
  useEffect(() => {
    const handleUpdate = (event: CustomEvent) => {
      const { item: updatedItem } = event.detail;
      // Use ref for current item ID to avoid stale closure
      if (updatedItem && updatedItem.id === itemIdRef.current) {
        setItem(updatedItem);
      }
    };
    
    window.addEventListener('updateInboxPreview', handleUpdate as EventListener);
    return () => {
      window.removeEventListener('updateInboxPreview', handleUpdate as EventListener);
    };
  }, []); // Empty dependency - listen on mount
  
  // Update local state if prop changes (e.g., panel reopened with different item)
  useEffect(() => {
    setItem(initialItem);
    itemIdRef.current = initialItem.id;
  }, [initialItem]);
  
  // Add loading timeout - if loading state persists for 15 seconds, show error
  useEffect(() => {
    if (item.isLoading) {
      const timeoutId = setTimeout(() => {
        setItem(prev => {
          // Only update if still loading the same item
          if (prev.isLoading && prev.id === itemIdRef.current) {
            return {
              ...prev,
              isLoading: false,
              loadError: 'Loading took too long. Please try again.'
            };
          }
          return prev;
        });
      }, 15000); // 15 second timeout
      
      return () => clearTimeout(timeoutId);
    }
  }, [item.isLoading, item.id]);
  
  const isArchived = item.userStatus === 'archived';
  const isLoading = item.isLoading === true;
  // Navigation state: 'thread' for thread view, 'noteDetail' for individual note view
  const [viewMode, setViewMode] = useState<'thread' | 'noteDetail'>(item.contentType === 'note' ? 'noteDetail' : 'thread');
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(item.contentType === 'note' ? item.id : null);

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

  const handleUnarchive = async () => {
    if (!onUnarchive) return;
    setIsUnarchiving(true);
    try {
      await onUnarchive(item.id);
      onClose();
    } catch (error) {
      console.error('Error unarchiving:', error);
      alert('Failed to unarchive item. Please try again.');
    } finally {
      setIsUnarchiving(false);
    }
  };


  // Get header background color
  const headerBgColor = item.color ? getColorCSSVariable(item.color) : "var(--color-paper)";
  const colorName = extractColorName(headerBgColor);
  const textColor = getThreadTextColorCSS(colorName);

  // Sort notes by order
  const sortedNotes = item.notes ? [...item.notes].sort((a, b) => a.order - b.order) : [];
  
  // Find selected note for detail view
  const selectedNote = selectedNoteId 
    ? (item.contentType === 'note' 
        ? { id: item.id, title: item.title, content: item.content || '', order: 0 }
        : sortedNotes.find(note => note.id === selectedNoteId))
    : null;
  
  // Handle navigation to note detail
  const handleNoteClick = (noteId: string) => {
    setSelectedNoteId(noteId);
    setViewMode('noteDetail');
  };
  
  // Handle back button - return to thread or close panel
  const handleBack = () => {
    if (viewMode === 'noteDetail') {
      if (item.contentType === 'thread') {
        // Return to thread view
        setSelectedNoteId(null);
        setViewMode('thread');
      } else {
        // Single note - close panel
        onClose();
      }
    } else {
      // Already in thread view - close panel
      onClose();
    }
  };

  return (
    <>
      <style>{`
        /* Space button styles */
        .space-button {
          will-change: transform;
          transition: box-shadow 0.125s ease-in-out;
        }

        .space-button:not([data-outer-shadow]):active {
          filter: brightness(0.97);
          box-shadow: 
            0px -1px 0px 0px rgba(120, 118, 111, 0.2) inset,
            0px 1px 0px 0px rgba(120, 118, 111, 0.2) inset;
        }

        .space-button:active > div {
          translate: 0 0;
          transform: scale(0.98);
        }

        /* Loading progress bar animation */
        @keyframes progress {
          0% { transform: translateX(-100%); }
          50% { transform: translateX(0%); }
          100% { transform: translateX(100%); }
        }

        /* Rich text content styles - matching CardFullEditable display mode */
        .inbox-note-detail-content h2 {
          font-size: 18px !important;
          font-weight: 600 !important;
          line-height: 1.3 !important;
          margin-top: 1.5em !important;
          margin-bottom: 0.75em !important;
          color: var(--color-deep-grey) !important;
          font-family: var(--font-sans) !important;
        }

        .inbox-note-detail-content h2:first-child {
          margin-top: 0 !important;
        }

        .inbox-note-detail-content h3 {
          font-size: 16px !important;
          font-weight: 600 !important;
          line-height: 1.4 !important;
          margin-top: 1.25em !important;
          margin-bottom: 0.625em !important;
          color: var(--color-deep-grey) !important;
          font-family: var(--font-sans) !important;
        }

        .inbox-note-detail-content h3:first-child {
          margin-top: 0 !important;
        }

        .inbox-note-detail-content p {
          display: block !important;
          margin: 0.75em 0 !important;
          padding: 0 !important;
          line-height: 1.6 !important;
          color: var(--color-deep-grey) !important;
          font-family: var(--font-sans) !important;
          font-size: 16px !important;
        }

        .inbox-note-detail-content p:first-child {
          margin-top: 0 !important;
        }

        .inbox-note-detail-content p:last-child {
          margin-bottom: 0 !important;
        }
        
        /* Ensure empty paragraphs don't collapse */
        .inbox-note-detail-content p:empty {
          min-height: 0.75em;
        }

        .inbox-note-detail-content ul {
          list-style-type: disc !important;
          padding-left: 1.5em !important;
          margin-left: 0 !important;
        }

        .inbox-note-detail-content ol {
          list-style-type: decimal !important;
          padding-left: 1.5em !important;
          margin-left: 0 !important;
        }

        .inbox-note-detail-content li {
          display: list-item !important;
          list-style-position: outside !important;
          list-style-type: inherit !important;
          margin-bottom: 0.5em !important;
          color: var(--color-deep-grey) !important;
        }

        .inbox-note-detail-content hr {
          margin: 1.5em 0 !important;
          border: none !important;
          border-top: 1px solid #e5e5e5 !important;
          background: none !important;
          height: 1px !important;
          padding: 0 !important;
        }

        .inbox-note-detail-content hr:first-child {
          margin-top: 0 !important;
        }

        .inbox-note-detail-content hr:last-child {
          margin-bottom: 0 !important;
        }
      `}</style>
    <div className={`panel-wrapper ${inBottomSheet ? 'panel-wrapper--bottom-sheet' : ''} relative`} style={{ height: '100%', maxHeight: '100%', minHeight: 0 }}>
      {/* Loading indicator - progress bar at top */}
      {/* Content area that expands to fill available space - matches NewNotePanel structure */}
      <div className="flex-1 flex flex-col min-h-0 mb-3.5 overflow-hidden">
        {/* Note Detail View - matches NewNotePanel card structure */}
        {viewMode === 'noteDetail' && selectedNote ? (
          <div className="bg-white box-border flex flex-col h-full flex-1 min-h-0 items-start justify-start overflow-hidden pb-3 pt-6 px-3 relative rounded-[24px] shadow-[0px_3px_20px_0px_rgba(120,118,111,0.1)] gap-6" style={{ maxHeight: '100%', height: '100%' }}>
            {/* Header with title and note type icon */}
            <div className="box-border content-stretch flex gap-3 items-center px-3 py-0 relative shrink-0 w-full">
              <div className="basis-0 font-sans font-semibold grow leading-[0] min-h-px min-w-px not-italic relative shrink-0 text-[var(--color-deep-grey)] text-[24px]">
                <p className="leading-[normal]">
                  {selectedNote.title || "Untitled Note"}
                </p>
              </div>
              {/* Note type icon (bookmark for default notes) */}
              <div className="relative shrink-0 size-5" title="Note type">
                <svg className="block max-w-none size-full text-[var(--color-deep-grey)]" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/>
                </svg>
              </div>
            </div>
            
            {/* Content - matching CardFullEditable structure exactly */}
            <div className="flex-1 flex flex-col min-h-0 w-full" style={{ maxHeight: '100%', overflow: 'hidden', marginBottom: '-12px' }}>
              <div className="flex-fill flex-stack" style={{ gap: 0, maxHeight: '100%' }}>
                <div className="flex-1 flex flex-col min-h-0 px-3" style={{ height: 0, maxHeight: '100%', overflow: 'hidden' }}>
                  {item.loadError ? (
                    <div className="flex-1 flex-center">
                      <p className="text-[var(--color-stone-grey)]">{item.loadError}</p>
                    </div>
                  ) : (
                    <div 
                      className="flex-1 overflow-auto inbox-note-detail-content"
                      style={{ 
                        lineHeight: '1.6', 
                        minHeight: 0, 
                        paddingBottom: '12px' 
                      }}
                      dangerouslySetInnerHTML={{ __html: safeRenderHtml(normalizeHtmlContent(selectedNote.content)) }}
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Thread View - CardStack structure */
          <div className="box-border flex flex-col min-h-0 flex-1 items-start justify-start overflow-clip pb-6 pt-0 px-0 relative rounded-3xl shadow-[0px_3px_20px_0px_rgba(120,118,111,0.1)] w-full">
            {/* CardStack-like Header */}
            <div 
              className="box-border content-stretch flex gap-3 items-center justify-center leading-[0] mb-[-24px] not-italic pb-12 pt-6 px-6 relative shrink-0 w-full"
              style={{ 
                backgroundColor: headerBgColor, 
                color: textColor 
              }}
            >
              {/* Title */}
              <div className="basis-0 font-sans font-bold grow min-h-px min-w-px relative shrink-0 text-[24px] text-center">
                <p className="leading-[normal]">
                  {item.title}
                </p>
              </div>
            </div>

            {/* Content area */}
            <div className="flex-1 box-border flex flex-col min-h-0 overflow-clip relative w-full mb-[-24px]">
              <div className="flex-1 bg-[var(--color-snow-white)] box-border flex flex-col min-h-0 overflow-x-clip p-[12px] relative rounded-tl-[24px] rounded-tr-[24px] w-full">
                {/* Thread View - Thread with Notes */}
                {viewMode === 'thread' && item.contentType === 'thread' && (
                  <div className="flex flex-col h-full w-full">
                    <div className="flex-1 flex flex-col gap-3 overflow-y-auto min-h-0" style={{ paddingBottom: '12px' }}>
                      {item.loadError ? (
                        /* Error state */
                        <div className="text-center py-12">
                          <p className="text-[var(--color-stone-grey)] text-lg">{item.loadError}</p>
                        </div>
                      ) : sortedNotes.length > 0 ? (
                        sortedNotes.map((note, index) => {
                          const cleanContent = stripHtml(note.content);
                          const previewContent = cleanContent.substring(0, 150) + (cleanContent.length > 150 ? "..." : "");
                          
                          return (
                            <div 
                              key={note.id} 
                              className="content-item note-item card-enter" 
                              style={{ animationDelay: `${index * 50}ms` }}
                            >
                              <CardNote
                                title={note.title || "Untitled Note"}
                                content={previewContent}
                                noteType="default"
                                onClick={() => handleNoteClick(note.id)}
                              />
                            </div>
                          );
                        })
                      ) : (
                        <div style={{ textAlign: 'center', paddingTop: '64px', paddingBottom: '64px' }}>
                          <p style={{ fontWeight: 600, color: 'var(--color-pebble-grey)', fontSize: '18px' }}>
                            {isLoading ? '' : 'No notes found in this thread'}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Archive button at bottom of white container - only show if not archived */}
                    {!isArchived && (
                      <div className="shrink-0 mt-3">
                        <button
                          type="button"
                          onClick={handleArchive}
                          disabled={isArchiving || isAdding || isUnarchiving}
                          className="space-button relative rounded-3xl h-[64px] cursor-pointer transition-[scale,shadow] duration-200 pl-4 pr-0 w-full overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed"
                          style={{ backgroundImage: 'var(--color-gradient-gray)' }}
                        >
                          <div className="flex items-center justify-between relative w-full h-full pl-2 pr-0 transition-transform duration-125 min-w-0">
                            <div className="flex-1 min-w-0 overflow-hidden">
                              <span className="font-sans text-[18px] font-semibold whitespace-nowrap overflow-hidden text-ellipsis block" style={{ color: 'var(--color-deep-grey)' }}>
                                {isArchiving ? 'Archiving...' : 'Archive Thread'}
                              </span>
                            </div>
                          </div>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom buttons */}
      {viewMode === 'thread' ? (
        <div className="panel__footer--buttons">
          {/* Back button - SquareButton Back variant */}
          <SquareButton 
            variant="Back"
            onClick={handleBack}
            inBottomSheet={inBottomSheet}
          />
          
          {/* Add to Harvous or Unarchive button for thread */}
          {item.contentType === 'thread' && (
            <>
              {isArchived ? (
                <button 
                  type="button"
                  onClick={handleUnarchive}
                  disabled={isUnarchiving || isAdding || isArchiving}
                  data-outer-shadow
                  className="btn-cta flex-1 group"
                >
                  <span className="btn-cta__content">
                    {isUnarchiving ? 'Unarchiving...' : 'Unarchive'}
                  </span>
                  <div className="btn-cta__shadow" />
                </button>
              ) : (
                <button 
                  type="button"
                  onClick={handleAddToHarvous}
                  disabled={isAdding || isArchiving || isUnarchiving}
                  data-outer-shadow
                  className="btn-cta flex-1 group"
                >
                  <span className="btn-cta__content">
                    {isAdding ? 'Adding...' : 'Add to Harvous'}
                  </span>
                  <div className="btn-cta__shadow" />
                </button>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="panel__footer--buttons">
          {/* Back button - SquareButton Back variant */}
          <SquareButton 
            variant="Back"
            onClick={handleBack}
            inBottomSheet={inBottomSheet}
          />
          
          {/* Unarchive button for note detail (if archived) */}
          {selectedNote && isArchived && (
            <button 
              type="button"
              onClick={handleUnarchive}
              disabled={isUnarchiving || isAdding || isArchiving}
              data-outer-shadow
              className="btn-cta flex-1 group"
            >
              <span className="btn-cta__content">
                {isUnarchiving ? 'Unarchiving...' : 'Unarchive'}
              </span>
              <div className="btn-cta__shadow" />
            </button>
          )}
        </div>
      )}
    </div>
    </>
  );
}

