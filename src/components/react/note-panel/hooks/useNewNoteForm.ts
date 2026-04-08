import { useEffect } from 'react';
import { useNewNotePanelContext } from '@/components/react/contexts/NewNotePanelContext';
import type { NoteType, ResourceMetadata } from '@/components/react/contexts/NewNotePanelContext';

export type { NoteType, ResourceMetadata };

export interface UseNewNoteFormOptions {
  currentSpace?: { id: string; title: string; color?: string; backgroundGradient?: string } | null;
  initialNoteType?: NoteType;
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
}

/**
 * Hook for managing new note form state and localStorage persistence
 * Now consumes state from NewNotePanelContext for persistence across desktop/mobile panels
 */
export function useNewNoteForm(options: UseNewNoteFormOptions = {}): UseNewNoteFormReturn {
  const { currentSpace, initialNoteType } = options;
  
  // Consume state from context
  const context = useNewNotePanelContext();
  const { setInitialNoteType, setAddToSpace } = context;

  // Handle initialNoteType prop - set it in context when provided
  useEffect(() => {
    if (initialNoteType) {
      setInitialNoteType(initialNoteType);
    }
  }, [initialNoteType, setInitialNoteType]);

  // Initialize space checkbox when currentSpace is provided
  useEffect(() => {
    if (currentSpace && currentSpace.id) {
      setAddToSpace(true);
    }
  }, [currentSpace, setAddToSpace]);

  return {
    // State
    title: context.title,
    setTitle: context.setTitle,
    content: context.content,
    setContent: context.setContent,
    noteType: context.noteType,
    setNoteType: context.setNoteType,
    scriptureReference: context.scriptureReference,
    setScriptureReference: context.setScriptureReference,
    scriptureVersion: context.scriptureVersion,
    setScriptureVersion: context.setScriptureVersion,
    resourceUrl: context.resourceUrl,
    setResourceUrl: context.setResourceUrl,
    resourceMetadata: context.resourceMetadata,
    setResourceMetadata: context.setResourceMetadata,
    sourceNoteId: context.sourceNoteId,
    sourceSelectionFrom: context.sourceSelectionFrom,
    sourceSelectionTo: context.sourceSelectionTo,
    addToSpace: context.addToSpace,
    setAddToSpace: context.setAddToSpace,
    selectedTemplateId: context.selectedTemplateId,
    setSelectedTemplateId: context.setSelectedTemplateId,

    // Refs
    isLoadingFromLocalStorage: context.isLoadingFromLocalStorage,
    
    // Functions
    hasUnsavedChanges: context.hasUnsavedChanges,
    resetForm: context.resetForm,
    clearLocalStorage: context.clearLocalStorage,
    rehydrateFromStorage: context.rehydrateFromStorage,
  };
}

