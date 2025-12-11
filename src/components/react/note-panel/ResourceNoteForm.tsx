import React, { useState, useEffect } from 'react';
import Icon from '../Icon';
import { normalizeUrl } from '@/utils/validation';

export interface ResourceNoteFormProps {
  resourceUrl: string;
  onResourceUrlChange: (url: string) => void;
  nextNoteId: string;
  onMetadataFetched?: (metadata: { title: string; description: string; image: string }) => void;
}

/**
 * Resource note type form with URL input
 * Automatically fetches Open Graph metadata when URL is provided
 */
export default function ResourceNoteForm({
  resourceUrl,
  onResourceUrlChange,
  nextNoteId,
  onMetadataFetched,
}: ResourceNoteFormProps) {
  const [isFetchingMetadata, setIsFetchingMetadata] = useState(false);
  const [metadata, setMetadata] = useState<{ title: string; description: string; image: string } | null>(null);

  // Fetch metadata when URL changes (debounced)
  useEffect(() => {
    if (!resourceUrl || resourceUrl.trim() === '') {
      setMetadata(null);
      return;
    }

    // Normalize URL by adding https:// if missing
    const normalizedUrl = normalizeUrl(resourceUrl);

    // Basic URL validation
    let validUrl: string;
    try {
      new URL(normalizedUrl);
      validUrl = normalizedUrl;
    } catch {
      // Invalid URL even after normalization, don't fetch
      return;
    }

    // Debounce metadata fetching
    const timeoutId = setTimeout(async () => {
      setIsFetchingMetadata(true);
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
            if (onMetadataFetched) {
              onMetadataFetched(data.metadata);
            }
          }
        }
      } catch (error) {
        // Silently fail - user can still create note without metadata
        // Silently fail - user can still create note without metadata
      } finally {
        setIsFetchingMetadata(false);
      }
    }, 1000); // 1 second debounce

    return () => clearTimeout(timeoutId);
  }, [resourceUrl, onMetadataFetched]);

  return (
    <div className="bg-white box-border flex flex-col flex-1 min-h-0 items-start pb-3 pt-6 px-3 relative rounded-[24px] shadow-[0px_3px_20px_0px_rgba(120,118,111,0.1)]" style={{ maxHeight: '100%' }}>
      {/* URL Input - Single input field at top, similar to MyChurchPanel */}
      <div className="w-full shrink-0">
        <div className="search-input rounded-3xl py-5 px-4 min-h-[64px] w-full">
          <input 
            type="text"
            value={resourceUrl}
            onChange={(e) => onResourceUrlChange(e.target.value)}
            placeholder="Paste or enter URL..."
            tabIndex={1}
            className="outline-none bg-transparent text-[18px] font-semibold text-[var(--color-deep-grey)] text-center placeholder:text-[var(--color-pebble-grey)] placeholder:opacity-50 w-full" 
          />
        </div>
        {/* Loading indicator below input */}
        {isFetchingMetadata && (
          <div className="flex items-center justify-center w-full mt-2">
            <div className="animate-spin" style={{ width: '16px', height: '16px' }}>
              <Icon name="circle-info" size={16} style={{ color: 'var(--color-deep-grey)', opacity: 0.5 }} />
            </div>
          </div>
        )}
      </div>

      {/* Metadata Preview - Card style with source URL */}
      {metadata && (metadata.title || metadata.description || metadata.image) && (
        <div 
          className="w-full shrink-0 mt-4"
          style={{
            animation: 'fadeInUp 0.3s ease-out forwards'
          }}
        >
          {/* Preview label */}
          <div 
            style={{ 
              fontFamily: 'var(--font-sans)',
              fontSize: '11px',
              fontWeight: 600,
              color: 'var(--color-stone-grey)',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              marginBottom: '8px',
              paddingLeft: '4px'
            }}
          >
            Preview
          </div>
          
          {/* Card container */}
          <div 
            style={{ 
              backgroundColor: 'var(--color-snow-white)',
              borderRadius: '16px',
              overflow: 'hidden',
              boxShadow: '0px 2px 8px rgba(120, 118, 111, 0.12)'
            }}
          >
            {/* Image banner - full width at top */}
            {metadata.image && (
              <div 
                style={{ 
                  width: '100%',
                  height: '120px',
                  backgroundImage: `url('${metadata.image}')`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  position: 'relative'
                }}
              >
                {/* Gradient overlay */}
                <div 
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: '60px',
                    background: 'linear-gradient(to top, rgba(0,0,0,0.4) 0%, transparent 100%)'
                  }}
                />
              </div>
            )}
            
            {/* Content area */}
            <div style={{ padding: '12px 16px 16px' }}>
              {/* Title */}
              {metadata.title && (
                <div 
                  style={{ 
                    fontFamily: 'var(--font-sans)',
                    fontWeight: 700,
                    fontSize: '16px',
                    color: 'var(--color-deep-grey)',
                    lineHeight: 1.3,
                    marginBottom: metadata.description ? '6px' : '0'
                  }}
                >
                  {metadata.title}
                </div>
              )}
              
              {/* Description */}
              {metadata.description && (
                <div 
                  style={{ 
                    fontFamily: 'var(--font-sans)',
                    fontWeight: 400,
                    fontSize: '13px',
                    color: 'var(--color-stone-grey)',
                    lineHeight: 1.4,
                    overflow: 'hidden',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical'
                  }}
                >
                  {metadata.description}
                </div>
              )}
              
              {/* Source URL */}
              <div 
                style={{ 
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  marginTop: '12px',
                  paddingTop: '12px',
                  borderTop: '1px solid var(--color-fog-white)'
                }}
              >
                <Icon name="link" size={12} style={{ color: 'var(--color-pebble-grey)', flexShrink: 0 }} />
                <div 
                  style={{ 
                    fontFamily: 'var(--font-sans)',
                    fontSize: '11px',
                    color: 'var(--color-pebble-grey)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {(() => {
                    try {
                      const url = new URL(normalizeUrl(resourceUrl));
                      return url.hostname.replace('www.', '');
                    } catch {
                      return resourceUrl;
                    }
                  })()}
                </div>
              </div>
            </div>
          </div>
          
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
          `}</style>
        </div>
      )}

      {/* Footer with date and note ID */}
      <div className="flex font-sans font-normal items-center justify-between leading-[0] not-italic px-3 py-0 relative shrink-0 text-[var(--color-stone-grey)] text-[12px] text-nowrap w-full" style={{ marginTop: '8px' }}>
        <div className="relative shrink-0">
          <p className="leading-[normal] text-nowrap whitespace-pre">Today</p>
        </div>
        <div className="relative shrink-0">
          <p className="leading-[normal] text-nowrap whitespace-pre">{nextNoteId}</p>
        </div>
      </div>
    </div>
  );
}
