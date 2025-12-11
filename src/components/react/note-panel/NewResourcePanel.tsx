import React, { useState, useEffect, useRef } from 'react';
import Icon from '../Icon';
import { normalizeUrl } from '@/utils/validation';

export interface NewResourcePanelProps {
  resourceUrl: string;
  onResourceUrlChange: (url: string) => void;
  nextNoteId: string;
  onMetadataFetched?: (metadata: { title: string; description: string; image: string }) => void;
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
}: NewResourcePanelProps) {
  const [isFetchingMetadata, setIsFetchingMetadata] = useState(false);
  const [metadata, setMetadata] = useState<{ title: string; description: string; image: string } | null>(null);
  const [fetchAttempted, setFetchAttempted] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [isPasteEvent, setIsPasteEvent] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const fetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-focus input when component mounts
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Handle clear button click
  const handleClear = () => {
    onResourceUrlChange('');
    setMetadata(null);
    setFetchAttempted(false);
    setUrlError(null);
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

  // Fetch metadata when URL changes (debounced)
  useEffect(() => {
    // Clear any pending timeout
    if (fetchTimeoutRef.current) {
      clearTimeout(fetchTimeoutRef.current);
    }

    if (!resourceUrl || resourceUrl.trim() === '') {
      setMetadata(null);
      setFetchAttempted(false);
      setUrlError(null);
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
        const response = await fetch('/api/resource/metadata', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({ url: validUrl }),
        });

        if (response.ok) {
          const data = await response.json();
          if (data.success && data.metadata) {
            setMetadata(data.metadata);
            setUrlError(null);
            if (onMetadataFetched) {
              onMetadataFetched(data.metadata);
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
  }, [resourceUrl, onMetadataFetched, isPasteEvent]);

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
    <div className="bg-white box-border flex flex-col flex-1 min-h-0 items-start pb-3 pt-6 px-3 relative rounded-[24px] shadow-[0px_3px_20px_0px_rgba(120,118,111,0.1)]" style={{ maxHeight: '100%' }}>
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

      {/* Preview Area - Takes up available height */}
      <div 
        className="w-full mt-4"
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {/* Skeleton Loader - simple light gray background */}
        {isFetchingMetadata && !metadata && (
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
              flex: 1,
              animation: 'fadeInUp 0.3s ease-out forwards'
            }}
          >
            {/* Full-width image at top */}
            {metadata.image && (
              <div 
                className="card-image-link__image card-image-link__bg--image"
                style={{ 
                  backgroundImage: `url('${metadata.image}')`
                }}
              />
            )}
            
            {/* Header with title and newspaper icon */}
            <div className="card-image-link__header">
              <div className="card-image-link__title">
                <p>{metadata.title || 'Untitled Resource'}</p>
              </div>
              <div className="card-image-link__bookmark">
                <Icon name="newspaper" size={20} style={{ color: 'var(--color-deep-grey)' }} />
              </div>
            </div>
            
            {/* Description */}
            {metadata.description && (
              <div className="card-image-link__content">
                <div className="card-image-link__content-text">
                  <p>{metadata.description}</p>
                </div>
              </div>
            )}
            
            {/* Source bar with hostname and external link icon */}
            <div className="card-image-link__source">
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
      </div>

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

      {/* Animations */}
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
      `}</style>
    </div>
  );
}
