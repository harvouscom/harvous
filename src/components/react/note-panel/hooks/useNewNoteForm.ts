import { useState, useEffect, useRef } from 'react';

export type NoteType = 'default' | 'scripture' | 'resource';

export interface UseNewNoteFormOptions {
  currentSpace?: { id: string; title: string; color?: string; backgroundGradient?: string } | null;
}

export interface UseNewNoteFormReturn {
  // State
  title: string;
  setTitle: (title: string) => void;
  content: string;
  setContent: (content: string) => void;
  noteType: NoteType;
  setNoteType: (type: NoteType) => void;
  scriptureReference: string;
  setScriptureReference: (ref: string) => void;
  scriptureVersion: string;
  setScriptureVersion: (version: string) => void;
  resourceUrl: string;
  setResourceUrl: (url: string) => void;
  sourceNoteId: string | null;
  sourceSelectionFrom: number | null;
  sourceSelectionTo: number | null;
  addToSpace: boolean;
  setAddToSpace: (add: boolean) => void;
  
  // Refs
  isLoadingFromLocalStorage: React.MutableRefObject<boolean>;
  
  // Functions
  hasUnsavedChanges: () => boolean;
  resetForm: () => void;
  clearLocalStorage: () => void;
}

/**
 * Hook for managing new note form state and localStorage persistence
 */
export function useNewNoteForm(options: UseNewNoteFormOptions = {}): UseNewNoteFormReturn {
  const { currentSpace } = options;
  
  // Form state
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [noteType, setNoteType] = useState<NoteType>('default');
  const [scriptureReference, setScriptureReference] = useState('');
  const [scriptureVersion, setScriptureVersion] = useState('NET');
  const [resourceUrl, setResourceUrl] = useState('');
  const [sourceNoteId, setSourceNoteId] = useState<string | null>(null);
  const [sourceSelectionFrom, setSourceSelectionFrom] = useState<number | null>(null);
  const [sourceSelectionTo, setSourceSelectionTo] = useState<number | null>(null);
  const [addToSpace, setAddToSpace] = useState(false);
  
  // Track if we're loading from localStorage to prevent auto-detection toast on mount
  const isLoadingFromLocalStorage = useRef(false);

  // Load data from localStorage on mount
  useEffect(() => {
    const savedTitle = localStorage.getItem('newNoteTitle') || '';
    const savedContent = localStorage.getItem('newNoteContent') || '';
    const savedNoteType = localStorage.getItem('newNoteType') as NoteType | null;
    const savedScriptureRef = localStorage.getItem('newNoteScriptureReference') || '';
    const savedScriptureVersion = localStorage.getItem('newNoteScriptureVersion') || 'NET';
    const savedScriptureText = localStorage.getItem('newNoteScriptureText') || '';
    
    // Mark that we're loading from localStorage to prevent auto-detection toast
    isLoadingFromLocalStorage.current = true;
    
    // Load source note context for hyperlink creation
    const savedSourceNoteId = localStorage.getItem('newNoteSourceNoteId');
    const savedSourceSelectionFrom = localStorage.getItem('newNoteSourceSelectionFrom');
    const savedSourceSelectionTo = localStorage.getItem('newNoteSourceSelectionTo');
    
    if (savedSourceNoteId) {
      setSourceNoteId(savedSourceNoteId);
    }
    if (savedSourceSelectionFrom) {
      setSourceSelectionFrom(parseInt(savedSourceSelectionFrom, 10));
    }
    if (savedSourceSelectionTo) {
      setSourceSelectionTo(parseInt(savedSourceSelectionTo, 10));
    }
    
    // Set note type if detected from selection
    // IMPORTANT: Set noteType FIRST to prevent auto-detection from running
    if (savedNoteType === 'scripture') {
      setNoteType('scripture');
      if (savedScriptureRef) {
        // Keep original format (no divider in title)
        setScriptureReference(savedScriptureRef);
        // Set title after a brief delay to ensure noteType is set first
        setTimeout(() => {
          setTitle(savedScriptureRef); // Reference becomes title
          // Clear the flag after state updates complete
          setTimeout(() => {
            isLoadingFromLocalStorage.current = false;
          }, 100);
        }, 0);
      } else {
        // No scripture ref, clear flag immediately
        setTimeout(() => {
          isLoadingFromLocalStorage.current = false;
        }, 100);
      }
      if (savedScriptureVersion) {
        setScriptureVersion(savedScriptureVersion);
      }
      if (savedScriptureText) {
        setContent(savedScriptureText); // Verse text becomes content
      }
      // Clear after loading
      localStorage.removeItem('newNoteType');
      localStorage.removeItem('newNoteScriptureReference');
      localStorage.removeItem('newNoteScriptureVersion');
      localStorage.removeItem('newNoteScriptureText');
    } else if (savedNoteType === 'resource') {
      setNoteType('resource');
      const savedResourceUrl = localStorage.getItem('newNoteResourceUrl') || '';
      if (savedResourceUrl) {
        setResourceUrl(savedResourceUrl);
      }
      // Clear the flag after state updates complete
      setTimeout(() => {
        isLoadingFromLocalStorage.current = false;
      }, 100);
      // Clear after loading
      localStorage.removeItem('newNoteType');
      localStorage.removeItem('newNoteResourceUrl');
    } else {
      // Use saved title if not scripture or resource
      if (savedTitle) {
        setTitle(savedTitle);
      }
      // Clear the flag after state updates complete
      setTimeout(() => {
        isLoadingFromLocalStorage.current = false;
      }, 100);
    }
    
    // Handle content setting for non-scripture notes
    if (savedNoteType !== 'scripture') {
      if (savedContent) {
        setContent(savedContent);
        // Clear after loading to prevent re-loading on next open
        localStorage.removeItem('newNoteContent');
      } else {
        setContent('');
      }
    }
    
    // Handle thread selection separately (store pending thread ID)
    const savedThreadId = localStorage.getItem('newNoteThread') || '';
    if (savedThreadId) {
      localStorage.setItem('newNoteThreadPending', savedThreadId);
      localStorage.removeItem('newNoteThread');
    }
  }, []);

  // Initialize space checkbox when currentSpace is provided
  useEffect(() => {
    if (currentSpace && currentSpace.id) {
      setAddToSpace(true);
    }
  }, [currentSpace]);

  // Save title to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('newNoteTitle', title);
  }, [title]);

  // Save content to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('newNoteContent', content);
  }, [content]);

  // Save resourceUrl to localStorage when it changes
  useEffect(() => {
    if (noteType === 'resource') {
      localStorage.setItem('newNoteResourceUrl', resourceUrl);
    }
  }, [resourceUrl, noteType]);

  // Check if there are unsaved changes
  const hasUnsavedChanges = (): boolean => {
    const trimmedTitle = title.trim();
    const trimmedContent = content.trim();
    const trimmedResourceUrl = resourceUrl.trim();
    
    // Check if there's meaningful content (not just whitespace or empty HTML)
    const hasContent = trimmedContent && 
      trimmedContent !== '<p></p>' && 
      trimmedContent !== '<p><br></p>' &&
      trimmedContent !== '<br>';
    
    // For resource notes, check URL as well
    if (noteType === 'resource') {
      return Boolean(trimmedResourceUrl || hasContent);
    }
    
    return Boolean(trimmedTitle || hasContent);
  };

  // Reset form to initial state
  const resetForm = () => {
    setTitle('');
    setContent('');
    setNoteType('default');
    setScriptureReference('');
    setScriptureVersion('NET');
    setResourceUrl('');
  };

  // Clear localStorage entries
  const clearLocalStorage = () => {
    localStorage.removeItem('newNoteTitle');
    localStorage.removeItem('newNoteContent');
    localStorage.removeItem('newNoteResourceUrl');
    // Don't clear newNoteThread - preserve thread selection for next time
  };

  return {
    // State
    title,
    setTitle,
    content,
    setContent,
    noteType,
    setNoteType,
    scriptureReference,
    setScriptureReference,
    scriptureVersion,
    setScriptureVersion,
    resourceUrl,
    setResourceUrl,
    sourceNoteId,
    sourceSelectionFrom,
    sourceSelectionTo,
    addToSpace,
    setAddToSpace,
    
    // Refs
    isLoadingFromLocalStorage,
    
    // Functions
    hasUnsavedChanges,
    resetForm,
    clearLocalStorage,
  };
}

