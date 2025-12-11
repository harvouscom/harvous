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
          console.log('ResourceNoteForm: Metadata response:', data);
          if (data.success && data.metadata) {
            console.log('ResourceNoteForm: Metadata extracted:', {
              title: data.metadata.title,
              description: data.metadata.description,
              image: data.metadata.image
            });
            setMetadata(data.metadata);
            if (onMetadataFetched) {
              onMetadataFetched(data.metadata);
            }
          } else {
            console.warn('ResourceNoteForm: Metadata response not successful:', data);
          }
        } else {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
          console.error('ResourceNoteForm: Metadata fetch failed:', response.status, errorData);
        }
      } catch (error) {
        console.error('ResourceNoteForm: Error fetching resource metadata:', error);
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

      {/* Metadata Preview - Right below the input field */}
      {metadata && (metadata.title || metadata.description || metadata.image) && (
        <div className="w-full shrink-0 mt-4">
          <div className="bg-[var(--color-light-paper)] rounded-lg p-3 border border-[var(--color-pebble-grey)]">
            {metadata.image && (
              <div className="mb-2 rounded overflow-hidden" style={{ maxHeight: '200px' }}>
                <img 
                  src={metadata.image} 
                  alt={metadata.title || 'Resource preview'}
                  className="w-full h-auto object-cover"
                  onError={(e) => {
                    // Hide image on error
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              </div>
            )}
            {metadata.title && (
              <div className="font-semibold text-[var(--color-deep-grey)] mb-1 text-sm">
                {metadata.title}
              </div>
            )}
            {metadata.description && (
              <div className="text-[var(--color-stone-grey)] text-xs line-clamp-3">
                {metadata.description}
              </div>
            )}
          </div>
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
