import React, { createContext, use, useState, useEffect, useCallback } from 'react';
import type { ThreadColor } from '@/utils/colors';

interface Note {
  id: string;
  title: string | null;
  content: string;
  spaceId: string | null;
  noteType?: 'default' | 'scripture' | 'resource';
  [key: string]: unknown;
}

interface NewThreadPanelContextType {
  // State
  title: string;
  setTitle: (title: string) => void;
  selectedColor: ThreadColor;
  setSelectedColor: (color: ThreadColor) => void;
  selectedType: string;
  setSelectedType: (type: string) => void;
  addToSpace: boolean;
  setAddToSpace: (add: boolean) => void;
  selectedItems: string[];
  setSelectedItems: (items: string[] | ((prev: string[]) => string[])) => void;
  allNotes: Note[];
  setAllNotes: (notes: Note[]) => void;
  
  // Functions
  resetForm: () => void;
  clearLocalStorage: () => void;
}

const NewThreadPanelContext = createContext<NewThreadPanelContextType | undefined>(undefined);

export const NewThreadPanelProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [title, setTitle] = useState('');
  const [selectedColor, setSelectedColor] = useState<ThreadColor>('paper');
  const [selectedType, setSelectedType] = useState('Private');
  const [addToSpace, setAddToSpace] = useState(false);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [allNotes, setAllNotes] = useState<Note[]>([]);
  
  // Track if we've initialized from localStorage
  const hasInitializedRef = React.useRef(false);
  
  // Load data from localStorage on mount (only once, create mode only)
  useEffect(() => {
    if (hasInitializedRef.current) return;
    hasInitializedRef.current = true;
    
    if (typeof window === 'undefined') return;
    
    // Create mode: load from localStorage (except color, which always starts as 'paper')
    const savedTitle = localStorage.getItem('newThreadTitle') || '';
    // Always start with 'paper' color in create mode, don't load from localStorage
    const savedType = localStorage.getItem('newThreadType') || 'Private';
    
    setTitle(savedTitle);
    setSelectedColor('paper'); // Always start with 'paper' in create mode
    setSelectedType(savedType);
  }, []);
  
  // Save data to localStorage on change (create mode only)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem('newThreadTitle', title);
  }, [title]);
  
  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem('newThreadColor', selectedColor);
  }, [selectedColor]);
  
  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem('newThreadType', selectedType);
  }, [selectedType]);
  
  // Reset form to initial state
  const resetForm = useCallback(() => {
    setTitle('');
    setSelectedColor('paper');
    setSelectedType('Private');
    setSelectedItems([]);
  }, []);
  
  // Clear localStorage entries
  const clearLocalStorage = useCallback(() => {
    if (typeof window === 'undefined') return;
    localStorage.removeItem('newThreadTitle');
    localStorage.removeItem('newThreadColor');
    localStorage.removeItem('newThreadType');
  }, []);
  
  const value: NewThreadPanelContextType = {
    // State
    title,
    setTitle,
    selectedColor,
    setSelectedColor,
    selectedType,
    setSelectedType,
    addToSpace,
    setAddToSpace,
    selectedItems,
    setSelectedItems,
    allNotes,
    setAllNotes,
    
    // Functions
    resetForm,
    clearLocalStorage,
  };
  
  return (
    <NewThreadPanelContext value={value}>
      {children}
    </NewThreadPanelContext>
  );
};

export const useNewThreadPanelContext = () => {
  const context = use(NewThreadPanelContext);
  if (context === undefined) {
    throw new Error('useNewThreadPanelContext must be used within a NewThreadPanelProvider');
  }
  return context;
};
