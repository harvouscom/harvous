import React, { useEffect } from 'react';
import { initKeyboardShortcuts, cleanupKeyboardShortcuts } from '@/utils/keyboard-shortcuts';
import { safeNavigate } from '@/utils/safe-navigate';

/**
 * Initializes keyboard shortcuts and exposes appNavigate for scripts that need SPA navigation.
 */
export default function KeyboardShortcutsInit() {
  useEffect(() => {
    // Set up safe navigate function for View Transitions (with error handling)
    (window as any).appNavigate = (path: string, options?: any) => {
      safeNavigate(path, options);
    };
    
    // Initialize keyboard shortcuts on mount
    initKeyboardShortcuts();
    
    // Re-initialize after View Transitions
    const handlePageLoad = () => {
      cleanupKeyboardShortcuts();
      initKeyboardShortcuts();
    };
    
    document.addEventListener('app:route-change', handlePageLoad);
    
    // Cleanup on unmount
    return () => {
      cleanupKeyboardShortcuts();
      document.removeEventListener('app:route-change', handlePageLoad);
    };
  }, []);
  
  // This component doesn't render anything
  return null;
}

