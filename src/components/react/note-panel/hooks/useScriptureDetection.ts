import { useEffect, useRef } from 'react';
import { formatReferenceForAPI } from '@/utils/scripture-detector';
import type { NoteType } from './useNewNoteForm';

export interface UseScriptureDetectionOptions {
  title: string;
  content: string;
  noteType: NoteType;
  isLoadingFromLocalStorage: React.MutableRefObject<boolean>;
  setNoteType: (type: NoteType) => void;
  setTitle: (title: string) => void;
  setContent: (content: string) => void;
  setScriptureReference: (ref: string) => void;
  setScriptureVersion: (version: string) => void;
  scriptureReference: string;
  scriptureVersion: string;
}

export interface UseScriptureDetectionReturn {
  isFetchingVerse: boolean;
}

/**
 * Hook for auto-detecting scripture references in title and fetching verse text
 */
export function useScriptureDetection(options: UseScriptureDetectionOptions): UseScriptureDetectionReturn {
  const {
    title,
    content,
    noteType,
    isLoadingFromLocalStorage,
    setNoteType,
    setTitle,
    setContent,
    setScriptureReference,
    setScriptureVersion,
    scriptureReference,
    scriptureVersion,
  } = options;
  
  // Track fetching state internally
  const isFetchingRef = useRef(false);
  
  // Version change ref to track actual changes
  const versionChangeRef = useRef<string>(scriptureVersion);

  // Auto-detection: Detect scripture references ONLY in title (not content)
  useEffect(() => {
    // Only detect if note type is still default
    if (noteType !== 'default') return;
    
    // Skip auto-detection if loading from localStorage
    if (isLoadingFromLocalStorage.current) return;

    const titleToCheck = title.trim();
    if (titleToCheck.length < 5) return;

    // Debounce detection (1.2 seconds after typing stops)
    const timeoutId = setTimeout(async () => {
      // Double-check we're not loading from localStorage
      if (isLoadingFromLocalStorage.current) return;
      
      try {
        const response = await fetch('/api/scripture/detect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: titleToCheck }),
          credentials: 'include'
        });

        if (response.ok) {
          const detection = await response.json();
          
          if (detection.isScripture && detection.confidence >= 0.7 && detection.primaryReference) {
            // Fetch verse text
            isFetchingRef.current = true;
            try {
              const verseResponse = await fetch('/api/scripture/fetch-verse', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reference: detection.primaryReference }),
                credentials: 'include'
              });

              if (verseResponse.ok) {
                const verseData = await verseResponse.json();
                
                // Set note type to scripture
                setNoteType('scripture');
                setTitle(detection.primaryReference);
                
                // Set verse text as content only if content is empty or very short
                if (!content || content.trim().length < 10 || content === '<p></p>' || content === '<p><br></p>') {
                  setContent(verseData.text);
                }
                
                setScriptureReference(detection.primaryReference);
                setScriptureVersion('NET');
                
                // Show toast notification (only if not loading from localStorage)
                if (!isLoadingFromLocalStorage.current) {
                  if (window.toast && typeof window.toast.info === 'function') {
                    window.toast.info('Made a scripture note for you');
                  } else {
                    window.dispatchEvent(new CustomEvent('toast', {
                      detail: {
                        message: 'Made a scripture note for you',
                        type: 'info'
                      }
                    }));
                  }
                }
              }
            } catch {
              // Silently fail - don't interrupt UX
            } finally {
              isFetchingRef.current = false;
            }
          }
        }
      } catch {
        // Silently fail - don't interrupt UX
      }
    }, 1200);

    return () => clearTimeout(timeoutId);
  }, [title, noteType, content, isLoadingFromLocalStorage, setNoteType, setTitle, setContent, setScriptureReference, setScriptureVersion]);

  // Version change handler (for future - when multiple translations are supported)
  useEffect(() => {
    if (noteType !== 'scripture' || !scriptureReference) return;
    if (versionChangeRef.current === scriptureVersion) return;

    const fetchNewVersion = async () => {
      isFetchingRef.current = true;
      try {
        const apiReference = formatReferenceForAPI(scriptureReference);
        const verseResponse = await fetch('/api/scripture/fetch-verse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reference: apiReference }),
          credentials: 'include'
        });

        if (verseResponse.ok) {
          const verseData = await verseResponse.json();
          setContent(verseData.text);
        }
      } catch {
        // Error fetching verse with new version
      } finally {
        isFetchingRef.current = false;
      }
    };

    const timeoutId = setTimeout(() => {
      fetchNewVersion();
      versionChangeRef.current = scriptureVersion;
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [scriptureVersion, scriptureReference, noteType, setContent]);

  return {
    isFetchingVerse: isFetchingRef.current,
  };
}

// Extend Window interface for toast
declare global {
  interface Window {
    toast?: {
      info: (message: string) => void;
      success: (message: string) => void;
      error: (message: string) => void;
      warning: (message: string) => void;
    };
  }
}

