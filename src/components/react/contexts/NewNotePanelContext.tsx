import React, { createContext, use, useState, useEffect, useRef, useCallback } from 'react';
import { getTemplateById } from '@/data/note-templates';
import { getCachedProfileData } from '@/utils/profile-cache';

export type NoteType = 'default' | 'scripture' | 'resource';

export interface ResourceMetadata {
  title: string;
  description: string;
  image: string;
  articleContent?: string;
  siteName?: string | null;
}

interface NewNotePanelContextType {
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
  resourceMetadata: ResourceMetadata | null;
  setResourceMetadata: (metadata: ResourceMetadata | null) => void;
  sourceNoteId: string | null;
  sourceSelectionFrom: number | null;
  sourceSelectionTo: number | null;
  addToSpace: boolean;
  setAddToSpace: (add: boolean) => void;
  selectedTemplateId: string | null;
  setSelectedTemplateId: (id: string | null) => void;

  // Refs
  isLoadingFromLocalStorage: React.MutableRefObject<boolean>;
  
  // Functions
  hasUnsavedChanges: () => boolean;
  resetForm: () => void;
  clearLocalStorage: () => void;
  rehydrateFromStorage: () => void;

  // Internal function to handle initialNoteType prop
  setInitialNoteType: (type: NoteType) => void;
}

const NewNotePanelContext = createContext<NewNotePanelContextType | undefined>(undefined);

export const NewNotePanelProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Form state
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [noteType, setNoteType] = useState<NoteType>('default');
  const [scriptureReference, setScriptureReference] = useState('');
  const [scriptureVersion, setScriptureVersion] = useState(() => {
    // Use user's default translation from profile cache, falling back to 'NET'
    const profile = typeof window !== 'undefined' ? getCachedProfileData() : null;
    return profile?.defaultTranslation || 'NET';
  });
  const [resourceUrl, setResourceUrl] = useState('');
  const [resourceMetadata, setResourceMetadata] = useState<ResourceMetadata | null>(null);
  const [sourceNoteId, setSourceNoteId] = useState<string | null>(null);
  const [sourceSelectionFrom, setSourceSelectionFrom] = useState<number | null>(null);
  const [sourceSelectionTo, setSourceSelectionTo] = useState<number | null>(null);
  const [addToSpace, setAddToSpace] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);

  // Track if we're loading from localStorage to prevent auto-detection toast on mount
  const isLoadingFromLocalStorage = useRef(false);
  
  // Track if we've initialized from localStorage
  const hasInitializedRef = useRef(false);
  
  // Load data from localStorage on mount (only once)
  useEffect(() => {
    if (hasInitializedRef.current) return;
    hasInitializedRef.current = true;
    
    if (typeof window === 'undefined') return;
    
    const savedTitle = localStorage.getItem('newNoteTitle') || '';
    let savedContent = localStorage.getItem('newNoteContent') || '';
    if (localStorage.getItem('newNoteContentEmptyFromSelection') === 'true') {
      savedContent = '';
      localStorage.removeItem('newNoteContentEmptyFromSelection');
    }
    const savedNoteType = localStorage.getItem('newNoteType') as NoteType | null;
    const savedScriptureRef = localStorage.getItem('newNoteScriptureReference') || '';
    const profileDefault1 = getCachedProfileData()?.defaultTranslation || 'NET';
    const savedScriptureVersion = localStorage.getItem('newNoteScriptureVersion') || profileDefault1;
    const savedScriptureText = localStorage.getItem('newNoteScriptureText') || '';
    const savedTemplateId = localStorage.getItem('newNoteTemplateId') || '';

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

    // Load template selection if available
    if (savedTemplateId) {
      setSelectedTemplateId(savedTemplateId);
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
        // Don't clear localStorage here - draft is preserved until successful submit
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
  
  // Handle initialNoteType prop - this is called when a panel opens with a specific type
  const setInitialNoteType = useCallback((type: NoteType) => {
    setNoteType(type);
    if (type === 'resource') {
      const savedResourceUrl = localStorage.getItem('newNoteResourceUrl') || '';
      if (savedResourceUrl) {
        setResourceUrl(savedResourceUrl);
      }
      // Clear localStorage after reading
      localStorage.removeItem('newNoteType');
      localStorage.removeItem('newNoteResourceUrl');
    }
    
    // Still load title/content if available (for draft persistence)
    if (typeof window !== 'undefined') {
      const savedTitle = localStorage.getItem('newNoteTitle') || '';
      const savedContent = localStorage.getItem('newNoteContent') || '';
      if (savedTitle) {
        setTitle(savedTitle);
      }
      if (savedContent && type !== 'scripture') {
        setContent(savedContent);
      }
    }
    
    isLoadingFromLocalStorage.current = true;
    setTimeout(() => {
      isLoadingFromLocalStorage.current = false;
    }, 100);
  }, []);
  
  // Save title to localStorage when it changes
  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem('newNoteTitle', title);
  }, [title]);
  
  // Save content to localStorage when it changes (debounced to prevent excessive writes)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Debounce content saves to every 2 seconds of inactivity
    const timeoutId = setTimeout(() => {
      localStorage.setItem('newNoteContent', content);
      localStorage.setItem('newNoteContentTimestamp', Date.now().toString());
    }, 2000);

    return () => clearTimeout(timeoutId);
  }, [content]);
  
  // Save resourceUrl to localStorage when it changes
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (noteType === 'resource') {
      localStorage.setItem('newNoteResourceUrl', resourceUrl);
    }
  }, [resourceUrl, noteType]);

  // Apply template when selected
  useEffect(() => {
    if (selectedTemplateId) {
      const template = getTemplateById(selectedTemplateId);
      if (template) {
        // Pre-fill form with template data
        setTitle(template.titleTemplate || '');
        setContent(template.content);
        setNoteType(template.noteType);
      }
    }
  }, [selectedTemplateId]);

  // Save template selection to localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (selectedTemplateId) {
      localStorage.setItem('newNoteTemplateId', selectedTemplateId);
    } else {
      localStorage.removeItem('newNoteTemplateId');
    }
  }, [selectedTemplateId]);
  
  // Check if there are unsaved changes
  const hasUnsavedChanges = useCallback((): boolean => {
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
  }, [title, content, resourceUrl, noteType]);
  
  // Reset form to initial state
  const resetForm = useCallback(() => {
    setTitle('');
    setContent('');
    setNoteType('default');
    setScriptureReference('');
    setScriptureVersion('NET');
    setResourceUrl('');
    setResourceMetadata(null);
  }, []);
  
  // Clear localStorage entries
  const clearLocalStorage = useCallback(() => {
    if (typeof window === 'undefined') return;
    localStorage.removeItem('newNoteTitle');
    localStorage.removeItem('newNoteContent');
    localStorage.removeItem('newNoteContentEmptyFromSelection');
    localStorage.removeItem('newNoteResourceUrl');
    localStorage.removeItem('newNoteTemplateId');
    // Don't clear newNoteThread - preserve thread selection for next time
  }, []);

  // Rehydrate form state from localStorage (used when mobile panel opens to sync desktop draft)
  const rehydrateFromStorage = useCallback(() => {
    if (typeof window === 'undefined') return;
    const contentEmptyFromSelection = localStorage.getItem('newNoteContentEmptyFromSelection') === 'true';
    let savedTitle = localStorage.getItem('newNoteTitle') || '';
    let savedContent = localStorage.getItem('newNoteContent') || '';
    if (contentEmptyFromSelection) {
      savedContent = '';
      localStorage.removeItem('newNoteContentEmptyFromSelection');
    }
    const savedNoteType = localStorage.getItem('newNoteType') as NoteType | null;
    const savedScriptureRef = localStorage.getItem('newNoteScriptureReference') || '';
    const profileDefault2 = getCachedProfileData()?.defaultTranslation || 'NET';
    const savedScriptureVersion = localStorage.getItem('newNoteScriptureVersion') || profileDefault2;
    const savedScriptureText = localStorage.getItem('newNoteScriptureText') || '';
    const savedResourceUrl = localStorage.getItem('newNoteResourceUrl') || '';
    const savedTemplateId = localStorage.getItem('newNoteTemplateId') || '';
    const savedSourceNoteId = localStorage.getItem('newNoteSourceNoteId');
    const savedSourceSelectionFrom = localStorage.getItem('newNoteSourceSelectionFrom');
    const savedSourceSelectionTo = localStorage.getItem('newNoteSourceSelectionTo');

    isLoadingFromLocalStorage.current = true;

    if (savedSourceNoteId) {
      setSourceNoteId(savedSourceNoteId);
    } else {
      setSourceNoteId(null);
    }
    if (savedSourceSelectionFrom) {
      setSourceSelectionFrom(parseInt(savedSourceSelectionFrom, 10));
    } else {
      setSourceSelectionFrom(null);
    }
    if (savedSourceSelectionTo) {
      setSourceSelectionTo(parseInt(savedSourceSelectionTo, 10));
    } else {
      setSourceSelectionTo(null);
    }

    if (savedTemplateId) {
      setSelectedTemplateId(savedTemplateId);
    } else {
      setSelectedTemplateId(null);
    }

    if (savedNoteType === 'scripture') {
      setNoteType('scripture');
      setScriptureReference(savedScriptureRef);
      setScriptureVersion(savedScriptureVersion);
      setTitle(savedScriptureRef || savedTitle);
      setContent(savedScriptureText || savedContent);
    } else if (savedNoteType === 'resource') {
      setNoteType('resource');
      setResourceUrl(savedResourceUrl);
      setTitle(savedTitle);
      setContent(savedContent);
    } else {
      setNoteType('default');
      setScriptureReference('');
      setScriptureVersion('NET');
      setTitle(savedTitle);
      setContent(savedContent);
    }

    const savedThreadId = localStorage.getItem('newNoteThread') || '';
    if (savedThreadId) {
      localStorage.setItem('newNoteThreadPending', savedThreadId);
    }

    setTimeout(() => {
      isLoadingFromLocalStorage.current = false;
    }, 100);
  }, []);

  const value: NewNotePanelContextType = {
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
    resourceMetadata,
    setResourceMetadata,
    sourceNoteId,
    sourceSelectionFrom,
    sourceSelectionTo,
    addToSpace,
    setAddToSpace,
    selectedTemplateId,
    setSelectedTemplateId,

    // Refs
    isLoadingFromLocalStorage,
    
    // Functions
    hasUnsavedChanges,
    resetForm,
    clearLocalStorage,
    rehydrateFromStorage,
    setInitialNoteType,
  };
  
  return (
    <NewNotePanelContext value={value}>
      {children}
    </NewNotePanelContext>
  );
};

export const useNewNotePanelContext = () => {
  const context = use(NewNotePanelContext);
  if (context === undefined) {
    throw new Error('useNewNotePanelContext must be used within a NewNotePanelProvider');
  }
  return context;
};
