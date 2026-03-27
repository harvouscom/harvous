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

    // Debounce detection (700ms after typing stops)
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
                body: JSON.stringify({ reference: detection.primaryReference, translation: scriptureVersion }),
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
                setScriptureVersion(scriptureVersion);
                
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
    }, 700);

    return () => clearTimeout(timeoutId);
  }, [title, noteType, content, scriptureVersion, isLoadingFromLocalStorage, setNoteType, setTitle, setContent, setScriptureReference, setScriptureVersion]);

  // Track previous reference for change detection
  const referenceChangeRef = useRef<string>(scriptureReference);

  // Shared fetch function for verse text
  const fetchVerseText = async (reference: string, translation: string) => {
    isFetchingRef.current = true;
    try {
      const apiReference = formatReferenceForAPI(reference);
      const verseResponse = await fetch('/api/scripture/fetch-verse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reference: apiReference, translation }),
        credentials: 'include'
      });

      if (verseResponse.ok) {
        const verseData = await verseResponse.json();
        setContent(verseData.text);
      }
    } catch {
      // Error fetching verse
    } finally {
      isFetchingRef.current = false;
    }
  };

  // Version change handler — fires immediately (discrete click action)
  useEffect(() => {
    if (noteType !== 'scripture' || !scriptureReference) return;
    if (versionChangeRef.current === scriptureVersion) return;

    fetchVerseText(scriptureReference, scriptureVersion);
    versionChangeRef.current = scriptureVersion;
  }, [scriptureVersion, scriptureReference, noteType, setContent]);

  // Reference change handler — debounced (user is typing)
  useEffect(() => {
    if (noteType !== 'scripture' || !scriptureReference) return;
    if (referenceChangeRef.current === scriptureReference) return;

    const trimmed = scriptureReference.trim();
    if (trimmed.length < 5) return;

    const timeoutId = setTimeout(() => {
      fetchVerseText(trimmed, scriptureVersion);
      referenceChangeRef.current = scriptureReference;
    }, 700);

    return () => clearTimeout(timeoutId);
  }, [scriptureReference, scriptureVersion, noteType, setContent]);

  return {
    isFetchingVerse: isFetchingRef.current,
  };
}

// Window.toast type is declared in env.d.ts

