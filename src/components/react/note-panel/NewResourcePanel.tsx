import React, { useState, useEffect, useRef } from 'react';
import { marked } from 'marked';
import Icon from '../Icon';
import CardNote from '../CardNote';
import ActionButton from '../ActionButton';
import { normalizeUrl } from '@/utils/validation';
import { safeNavigate } from '@/utils/safe-navigate';
import { safeRenderHtml } from '@/utils/content-renderer';

export interface NewResourcePanelProps {
  resourceUrl: string;
  onResourceUrlChange: (url: string) => void;
  nextNoteId: string;
  onMetadataFetched?: (metadata: { title: string; description: string; image: string; articleContent?: string; siteName?: string }) => void;
  onSuggestedThread?: (threadId: string, threadTitle: string) => void;
  onScriptureCountChange?: (count: number) => void;
  onDuplicateDetected?: (duplicateInfo: { exists: boolean; noteId?: string; simpleNoteId?: number; title?: string; description?: string; image?: string; url?: string } | null) => void;
}

/**
 * Resource note type panel with URL input
 * Automatically fetches Open Graph metadata when URL is provided
 */
export default function NewResourcePanel({
  resourceUrl,
  onResourceUrlChange,
  nextNoteId,
  onMetadataFetched,
  onSuggestedThread,
  onScriptureCountChange,
  onDuplicateDetected,
}: NewResourcePanelProps) {
  const [isFetchingMetadata, setIsFetchingMetadata] = useState(false);
  const [metadata, setMetadata] = useState<{ title: string; description: string; image: string; articleContent?: string; siteName?: string } | null>(null);
  const [detectedScriptures, setDetectedScriptures] = useState<Array<{ reference: string; text: string }>>([]);
  const [isDetectingScriptures, setIsDetectingScriptures] = useState(false);
  const [fetchAttempted, setFetchAttempted] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [isPasteEvent, setIsPasteEvent] = useState(false);
  const [duplicateInfo, setDuplicateInfo] = useState<{ exists: boolean; noteId?: string; simpleNoteId?: number; title?: string; description?: string; image?: string; url?: string } | null>(null);
  const [imageRemoved, setImageRemoved] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const fetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasAutoSelectedThreadRef = useRef(false);
  const originalTitleRef = useRef<string>('');
  const currentUrlRef = useRef<string>('');

  // Auto-focus input when component mounts
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Handle clear button click
  const handleClear = () => {
    onResourceUrlChange('');
    setMetadata(null);
    setDetectedScriptures([]);
    setFetchAttempted(false);
    setUrlError(null);
    setDuplicateInfo(null);
    setImageRemoved(false);
    setIsEditingTitle(false);
    setEditedTitle('');
    originalTitleRef.current = '';
    currentUrlRef.current = '';
    onDuplicateDetected?.(null);
    hasAutoSelectedThreadRef.current = false;
    inputRef.current?.focus();
  };

  // Handle paste event on input - just set flag for faster fetch
  // The actual URL update is handled by onChange
  const handlePaste = () => {
    setIsPasteEvent(true);
  };

  // Handle keyboard shortcuts
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Handle Select All (Cmd+A on Mac, Ctrl+A on Windows/Linux)
    if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
      e.preventDefault();
      inputRef.current?.select();
    }
  };

  // Handle title editing
  const handleTitleClick = () => {
    setIsEditingTitle(true);
    // Focus the input after state update
    setTimeout(() => {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }, 0);
  };

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEditedTitle(e.target.value);
  };

  const handleTitleBlur = () => {
    saveTitleEdit();
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveTitleEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      // Revert to original title
      setEditedTitle(originalTitleRef.current);
      setIsEditingTitle(false);
    }
  };

  const saveTitleEdit = () => {
    const trimmedTitle = editedTitle.trim();
    
    // If empty, revert to original title
    if (!trimmedTitle) {
      setEditedTitle(originalTitleRef.current);
      setIsEditingTitle(false);
      return;
    }

    // Update metadata with edited title
    if (metadata) {
      const updatedMetadata = { ...metadata, title: trimmedTitle };
      setMetadata(updatedMetadata);
      
      // Sync with parent component
      if (onMetadataFetched) {
        onMetadataFetched(updatedMetadata);
      }
    }
    
    setIsEditingTitle(false);
  };

  // Fetch metadata when URL changes (debounced)
  useEffect(() => {
    // Clear any pending timeout
    if (fetchTimeoutRef.current) {
      clearTimeout(fetchTimeoutRef.current);
    }

    if (!resourceUrl || resourceUrl.trim() === '') {
      setMetadata(null);
      setDetectedScriptures([]);
      setIsDetectingScriptures(false);
      setFetchAttempted(false);
      setUrlError(null);
      setDuplicateInfo(null);
      setImageRemoved(false);
      setIsEditingTitle(false);
      setEditedTitle('');
      originalTitleRef.current = '';
      currentUrlRef.current = '';
      onDuplicateDetected?.(null);
      onScriptureCountChange?.(0); // Reset scripture count when URL is cleared
      hasAutoSelectedThreadRef.current = false;
      return;
    }

    // Normalize URL by adding https:// if missing
    const normalizedUrl = normalizeUrl(resourceUrl.trim());

    // Basic URL validation
    let validUrl: string;
    try {
      new URL(normalizedUrl);
      validUrl = normalizedUrl;
      setUrlError(null);
    } catch {
      // Invalid URL even after normalization
      setUrlError('Invalid URL format');
      setFetchAttempted(false);
      setMetadata(null);
      return;
    }

    // Reset fetch attempted when URL changes
    setFetchAttempted(false);

    // Debounce metadata fetching (shorter delay for paste events)
    const debounceDelay = isPasteEvent ? 300 : 1000;
    
    fetchTimeoutRef.current = setTimeout(async () => {
      setIsFetchingMetadata(true);
      setIsPasteEvent(false); // Reset paste flag
      try {
        const response = await authenticatedFetch('/api/resource/metadata', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({ url: validUrl, extractContent: true }),
        });

        if (response.ok) {
          const data = await response.json();
          if (data.success && data.metadata) {
            // If user removed the image, don't restore it
            const metadataToSet = imageRemoved 
              ? { ...data.metadata, image: '' }
              : data.metadata;
            
            // Only reset edited title if this is a new URL (not just a re-fetch)
            const isNewUrl = currentUrlRef.current !== validUrl;
            const originalTitle = metadataToSet.title || '';
            
            if (isNewUrl) {
              // Store original title and initialize edited title for new URL
              originalTitleRef.current = originalTitle;
              setEditedTitle(originalTitle);
              currentUrlRef.current = validUrl;
            } else {
              // For same URL, preserve edited title (user may have edited it)
              // Only update the original title reference in case metadata changed
              originalTitleRef.current = originalTitle;
              // Don't reset editedTitle - preserve user's edits
            }
            
            // Use edited title if user has edited it, otherwise use original
            // For new URL, editedTitle was just set to originalTitle, so they're the same
            // For existing URL, preserve editedTitle if it exists (user may have edited it)
            const titleToUse = isNewUrl 
              ? originalTitle 
              : (editedTitle || originalTitle);
            const metadataWithEditedTitle = { ...metadataToSet, title: titleToUse };
            
            setMetadata(metadataWithEditedTitle);
            setUrlError(null);
            if (onMetadataFetched) {
              onMetadataFetched(metadataWithEditedTitle);
            }

            // Check for duplicate resource
            try {
              const duplicateResponse = await authenticatedFetch('/api/resource/check-duplicate', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify({ url: validUrl }),
              });

              if (duplicateResponse.ok) {
                const duplicateData = await duplicateResponse.json();
                if (duplicateData.exists) {
                  const duplicateInfo = {
                    exists: true,
                    noteId: duplicateData.noteId,
                    simpleNoteId: duplicateData.simpleNoteId,
                    title: duplicateData.title,
                    description: duplicateData.description || undefined,
                    image: duplicateData.image || undefined,
                    url: duplicateData.url || undefined,
                  };
                  setDuplicateInfo(duplicateInfo);
                  onDuplicateDetected?.(duplicateInfo);
                } else {
                  setDuplicateInfo({ exists: false });
                  onDuplicateDetected?.(null);
                }
              }
            } catch (error) {
              // Non-critical - duplicate check failure shouldn't block preview
              console.error('Error checking for duplicate resource:', error);
              setDuplicateInfo({ exists: false });
              onDuplicateDetected?.(null);
            }

            // Reset detected scriptures before detecting new ones
            setDetectedScriptures([]);
            onScriptureCountChange?.(0);
            
            // Detect scripture references if article content is available
            if (data.metadata.articleContent) {
              setIsDetectingScriptures(true);
              try {
                const scriptureResponse = await authenticatedFetch('/api/scripture/detect', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  credentials: 'include',
                  body: JSON.stringify({ text: data.metadata.articleContent }),
                });

                if (scriptureResponse.ok) {
                  const scriptureData = await scriptureResponse.json();
                  if (scriptureData.references && scriptureData.references.length > 0) {
                    const scriptures = scriptureData.references.map((ref: any) => ({
                      reference: ref.reference || ref.text || '',
                      text: ref.text || ref.reference || '',
                    }));
                    setDetectedScriptures(scriptures);
                    onScriptureCountChange?.(scriptures.length);
                  } else {
                    onScriptureCountChange?.(0);
                  }
                } else {
                  onScriptureCountChange?.(0);
                }
              } catch (error) {
                // Non-critical - scripture detection failure shouldn't block preview
                console.error('Error detecting scriptures:', error);
              } finally {
                setIsDetectingScriptures(false);
              }
            }

            // Fetch thread suggestions and auto-select if available
            if (!hasAutoSelectedThreadRef.current && onSuggestedThread) {
              try {
                const suggestResponse = await authenticatedFetch('/api/resource/suggest-threads', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  credentials: 'include',
                  body: JSON.stringify({
                    resourceUrl: validUrl,
                    sourceName: data.metadata.siteName || null,
                  }),
                });

                if (suggestResponse.ok) {
                  const suggestions = await suggestResponse.json();
                  
                  if (suggestions.success && suggestions.suggestedThreads && suggestions.suggestedThreads.length > 0) {
                    // Auto-select the first suggested thread
                    const firstSuggestion = suggestions.suggestedThreads[0];
                    onSuggestedThread(firstSuggestion.id, firstSuggestion.title);
                    hasAutoSelectedThreadRef.current = true;
                  } else if (suggestions.success && suggestions.suggestedThreadName) {
                    // No existing threads match, but we have a suggested name for a new thread
                    // Auto-select the suggested thread name (will create if needed)
                    onSuggestedThread('', suggestions.suggestedThreadName);
                    hasAutoSelectedThreadRef.current = true;
                  }
                }
              } catch (error) {
                console.error('Error fetching thread suggestions:', error);
              }
            }
          } else {
            setUrlError('Unable to load preview');
          }
        } else {
          setUrlError('Unable to load preview');
        }
      } catch (error) {
        setUrlError('Unable to load preview');
      } finally {
        setIsFetchingMetadata(false);
        setFetchAttempted(true);
      }
    }, debounceDelay);

    return () => {
      if (fetchTimeoutRef.current) {
        clearTimeout(fetchTimeoutRef.current);
      }
    };
  }, [resourceUrl, onMetadataFetched, onSuggestedThread, isPasteEvent]);

  // Get content for preview
  // Note: Scripture highlighting disabled for now due to regex matching issues
  // The detected scriptures will be used when the note is actually created
  const getPreviewContent = (): string => {
    if (!metadata) return '';
    
    // Prefer article content, fallback to description
    return metadata.articleContent || metadata.description || '';
  };

  const formatPreviewHtml = (raw: string | null | undefined): string => {
    // Ensure input is a string first
    if (raw === null || raw === undefined) return '';
    if (typeof raw !== 'string') {
      console.warn('[formatPreviewHtml] Non-string content received:', typeof raw);
      return '';
    }
    
    const trimmed = raw.trim();
    if (!trimmed) return '';
    
    // Trust the extractor completely - it already produces clean HTML
    // Only handle edge case: if it's pure plain text, wrap in paragraph
    if (!trimmed.includes('<')) {
      return `<p>${trimmed}</p>`;
    }
    
    return trimmed;
  };

  // Get full content for preview (no truncation - show everything)
  const getFullPreview = (): string => {
    return getPreviewContent();
  };

  // Check if we have a valid URL
  const hasValidUrl = (() => {
    if (!resourceUrl || resourceUrl.trim() === '') return false;
    try {
      new URL(normalizeUrl(resourceUrl.trim()));
      return true;
    } catch {
      return false;
    }
  })();

  return (
    <div className="box-border flex flex-col flex-1 min-h-0 items-start pb-3 pt-3 px-3 relative rounded-[24px] shadow-[0px_3px_20px_0px_rgba(120,118,111,0.1)]" style={{ maxHeight: '100%', backgroundColor: 'var(--color-snow-white)' }}>
      {/* URL Input - matches SearchInput pattern */}
      <div className="w-full shrink-0">
        <div className="search-input rounded-3xl py-5 px-4 min-h-[64px] w-full" style={{ gridTemplateColumns: '1fr auto' }}>
          <input 
            ref={inputRef}
            type="text"
            value={resourceUrl}
            onChange={(e) => onResourceUrlChange(e.target.value)}
            onPaste={handlePaste}
            onKeyDown={handleKeyDown}
            placeholder="Paste or enter URL..."
            tabIndex={1}
            className="search-input__field"
            style={{ fontSize: '18px', fontWeight: 600 }}
          />
          
          {/* Clear button - same pattern as SearchInput */}
          {resourceUrl ? (
            <button
              type="button"
              onClick={handleClear}
              aria-label="Clear URL"
              className="search-input__clear"
            >
              <svg width="20" height="20" viewBox="0 0 384 512" aria-hidden="true">
                <path d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z"/>
              </svg>
            </button>
          ) : (
            <span style={{ width: 20 }} />
          )}
        </div>

        {/* Error message */}
        {urlError && (
          <div style={{
            marginTop: '8px',
            paddingLeft: '16px',
            fontSize: '13px',
            color: 'var(--color-caring-coral)',
            fontFamily: 'var(--font-sans)'
          }}>
            {urlError}
          </div>
        )}

      </div>

      {/* Preview Area - Takes up available height with scrolling for long content */}
      <div 
        className="w-full mt-4"
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto'
        }}
      >
        {/* Show CardNote if duplicate exists */}
        {duplicateInfo?.exists ? (
          <CardNote
            noteType="resource"
            resourceTitle={duplicateInfo.title}
            resourceDescription={duplicateInfo.description}
            resourceImage={duplicateInfo.image}
            resourceUrl={duplicateInfo.url}
            className="w-full"
            showSource={false}
            onClick={() => {
              if (duplicateInfo.noteId) {
                safeNavigate(`/${duplicateInfo.noteId}`, { history: 'replace' });
              }
            }}
          />
        ) : (
          <>
            {/* Skeleton Loader - simple light gray background */}
            {(isFetchingMetadata || isDetectingScriptures) && !metadata && (
              <div 
                className="card-image-link"
                style={{ 
                  flex: 1,
                  backgroundColor: 'var(--color-light-paper)',
                  borderRadius: '12px',
                  animation: 'fadeIn 0.2s ease-out'
                }}
              />
            )}

            {/* Actual Preview using card-image-link layout */}
            {metadata && (metadata.title || metadata.description || metadata.image) && (
              <div 
                className="card-image-link"
                style={{
                  flex: 'none',
                  overflow: 'visible',
                  animation: 'fadeInUp 0.3s ease-out forwards'
                }}
              >
                {/* Full-width image at top */}
                {metadata.image && (
                  <div 
                    className="card-image-link__image card-image-link__bg--image"
                    style={{ 
                      backgroundImage: `url('${metadata.image}')`,
                      position: 'relative'
                    }}
                  >
                    {/* Remove image button */}
                    <ActionButton
                      variant="Close"
                      onClick={(e) => {
                        e.stopPropagation();
                        setImageRemoved(true);
                        // Preserve edited title when removing image
                        const updatedMetadata = { 
                          ...metadata, 
                          image: '',
                          title: editedTitle || metadata.title || ''
                        };
                        setMetadata(updatedMetadata);
                        if (onMetadataFetched) {
                          onMetadataFetched(updatedMetadata);
                        }
                      }}
                      aria-label="Remove image"
                      className=""
                      style={{
                        position: 'absolute',
                        top: '12px',
                        right: '12px',
                        width: '32px',
                        height: '32px'
                      }}
                    />
                  </div>
                )}
                
                {/* Header with title and newspaper icon */}
                <div className="card-image-link__header">
                  <div className="card-image-link__title">
                    {isEditingTitle ? (
                      <input
                        ref={titleInputRef}
                        type="text"
                        value={editedTitle}
                        onChange={handleTitleChange}
                        onBlur={handleTitleBlur}
                        onKeyDown={handleTitleKeyDown}
                        className="card-image-link__title-input"
                        style={{
                          width: '100%',
                          border: 'none',
                          outline: 'none',
                          background: 'transparent',
                          fontFamily: 'var(--font-sans)',
                          fontSize: 'inherit',
                          fontWeight: 'inherit',
                          color: 'inherit',
                          padding: 0,
                          margin: 0
                        }}
                      />
                    ) : (
                      <p 
                        onClick={handleTitleClick}
                        style={{
                          cursor: 'pointer',
                          userSelect: 'none'
                        }}
                      >
                        {editedTitle || metadata.title || 'Untitled Resource'}
                      </p>
                    )}
                  </div>
                  <div className="card-image-link__bookmark">
                    <Icon name="newspaper" size={20} style={{ color: 'var(--color-deep-grey)' }} />
                  </div>
                </div>
                
                {/* Description or Article Content - show full content with proper paragraph spacing */}
                {(metadata.description || metadata.articleContent) && (
                  <div className="card-image-link__content">
                    <div 
                      className="card-image-link__content-text resource-preview-content"
                      dangerouslySetInnerHTML={{ 
                        __html: safeRenderHtml(formatPreviewHtml(getFullPreview() || metadata.description || '')) 
                      }}
                      style={{
                        fontFamily: 'var(--font-sans)',
                        fontSize: '14px',
                        lineHeight: '1.6',
                        color: 'var(--color-deep-grey)'
                      }}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Empty state - only show after fetch attempted and failed */}
            {!isFetchingMetadata && !metadata && fetchAttempted && hasValidUrl && !urlError && (
              <div 
                style={{
                  height: '88px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: 'var(--color-snow-white)',
                  borderRadius: '12px',
                  color: 'var(--color-pebble-grey)',
                  fontSize: '13px',
                  fontFamily: 'var(--font-sans)'
                }}
              >
                Unable to load preview
              </div>
            )}
          </>
        )}
      </div>

      {/* Source bar - fixed at bottom of panel, outside scrollable area */}
      {!duplicateInfo?.exists && metadata && (metadata.title || metadata.description || metadata.image) && (
        <div 
          className="card-image-link__source"
          style={{
            flexShrink: 0,
            marginTop: '12px'
          }}
        >
          <div className="card-image-link__source-content" style={{ justifyContent: 'space-between' }}>
            <div className="card-image-link__source-text">
              <p>{(() => {
                try {
                  const url = new URL(normalizeUrl(resourceUrl.trim()));
                  return url.hostname.replace('www.', '');
                } catch {
                  return resourceUrl;
                }
              })()}</p>
            </div>
            <div className="card-image-link__source-icon">
              <Icon name="arrow-up-right-from-square" size={20} />
            </div>
          </div>
        </div>
      )}

      {/* Footer with date and note ID - moved below preview */}
      <div 
        className="flex font-sans font-normal items-center justify-between leading-[0] not-italic px-3 py-0 relative shrink-0 text-[var(--color-stone-grey)] text-[12px] text-nowrap w-full" 
        style={{ marginTop: '12px' }}
      >
        <div className="relative shrink-0">
          <p className="leading-[normal] text-nowrap whitespace-pre">Today</p>
        </div>
        <div className="relative shrink-0">
          <p className="leading-[normal] text-nowrap whitespace-pre">{nextNoteId}</p>
        </div>
      </div>

      {/* Animations and content styling */}
      <style>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        
        /* Resource preview content - proper paragraph spacing */
        .resource-preview-content p {
          margin: 0 0 1em 0;
        }
        .resource-preview-content p:last-child {
          margin-bottom: 0;
        }
        /* Ensure paragraphs have bottom margin */
        .resource-preview-content p {
          margin-bottom: 1.5em;
        }
        /* Headings styling - no top margin */
        .resource-preview-content h1,
        .resource-preview-content h2,
        .resource-preview-content h3,
        .resource-preview-content h4,
        .resource-preview-content h5,
        .resource-preview-content h6 {
          margin-top: 0;
          margin-bottom: 0.5em;
          font-weight: 700;
          line-height: 1.3;
          page-break-after: avoid;
        }
        .resource-preview-content ul,
        .resource-preview-content ol {
          margin: 0.5em 0 1em 0;
          padding-left: 1.5em;
        }
        .resource-preview-content li {
          margin-bottom: 0.25em;
        }
        .resource-preview-content blockquote {
          margin: 1em 0;
          padding: 0.75em 1em;
          border-left: 3px solid var(--color-stone-grey);
          background-color: var(--color-light-paper);
          border-radius: 4px;
        }
      `}</style>
    </div>
  );
}
