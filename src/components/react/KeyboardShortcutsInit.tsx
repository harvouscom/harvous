import { useEffect } from 'react';
import { initKeyboardShortcuts, cleanupKeyboardShortcuts } from '@/utils/keyboard-shortcuts';
import { navigate } from 'astro:transitions/client';

/**
 * Client-side component to initialize keyboard shortcuts and Astro navigation
 * This is needed because dynamic imports in script tags don't work with Astro path aliases
 */
export default function KeyboardShortcutsInit() {
  useEffect(() => {
    // Set up Astro's navigate function for View Transitions
    (window as any).astroNavigate = navigate;
    
    // Initialize keyboard shortcuts on mount
    initKeyboardShortcuts();
    
    // Re-initialize after View Transitions
    const handlePageLoad = () => {
      cleanupKeyboardShortcuts();
      initKeyboardShortcuts();
    };
    
    document.addEventListener('astro:page-load', handlePageLoad);
    
    // Cleanup on unmount
    return () => {
      cleanupKeyboardShortcuts();
      document.removeEventListener('astro:page-load', handlePageLoad);
    };
  }, []);
  
  // This component doesn't render anything
  return null;
}

