/**
 * Keyboard Shortcuts Handler
 * 
 * Provides keyboard shortcuts for power users with context-aware behavior.
 * Shortcuts are disabled when typing in text inputs, textareas, or contenteditable elements.
 */

/**
 * Check if user is currently typing in an input field
 */
function isTypingInInput(): boolean {
  if (typeof document === 'undefined') return false;
  
  const activeElement = document.activeElement as HTMLElement | null;
  if (!activeElement) return false;
  
  const tagName = activeElement.tagName.toLowerCase();
  
  // Check for input fields (excluding buttons, checkboxes, etc.)
  if (tagName === 'input') {
    const inputElement = activeElement as HTMLInputElement;
    const isInput = inputElement.type === 'text' || 
      inputElement.type === 'search' || 
      inputElement.type === 'email' || 
      inputElement.type === 'password' ||
      inputElement.type === 'url' ||
      inputElement.type === 'tel' ||
      !inputElement.type; // default type is text
    if (isInput) return true;
  }
  
  const isTextarea = tagName === 'textarea';
  const isContentEditable = activeElement.contentEditable === 'true';
  
  return isTextarea || isContentEditable;
}

/**
 * Check if a modifier key is pressed (Cmd on Mac, Ctrl on Windows/Linux)
 */
function isModifierPressed(event: KeyboardEvent): boolean {
  return event.metaKey || event.ctrlKey;
}

/**
 * Check if the app is focused (not browser chrome like address bar)
 * This allows browser shortcuts to work when browser chrome is focused,
 * but app shortcuts to work when app content is focused.
 */
function isAppFocused(): boolean {
  if (typeof document === 'undefined') return false;
  
  const activeElement = document.activeElement;
  if (!activeElement) return true; // Assume app focused if no active element
  
  // If activeElement is body, app is focused
  if (activeElement === document.body) return true;
  
  // Check if focus is in browser chrome (address bar, etc.)
  // Browser chrome elements are typically outside the body or have specific tags
  const tagName = activeElement.tagName.toLowerCase();
  
  // If it's an input/textarea but not in our app container, likely browser chrome
  // Check if the element is within the body (our app is always in body)
  if ((tagName === 'input' || tagName === 'textarea')) {
    // If the element is not within body, it's likely browser chrome
    if (!activeElement.closest('body')) {
      return false;
    }
  }
  
  // Check if element is within the app (has a parent in body)
  // All app content should be within body
  return activeElement.closest('body') !== null;
}

/**
 * Get current page context from URL
 */
function getPageContext(): { isNote: boolean; isThread: boolean; isSpace: boolean; path: string } {
  if (typeof window === 'undefined') {
    return { isNote: false, isThread: false, isSpace: false, path: '' };
  }
  
  const path = window.location.pathname;
  const isNote = path.startsWith('/note_');
  const isThread = path.startsWith('/thread_') || (path.startsWith('/') && path.length > 1 && !isNote && !path.startsWith('/space_') && path !== '/' && path !== '/find' && path !== '/profile' && path !== '/sign-in' && path !== '/new-space');
  const isSpace = path.startsWith('/space_');
  
  return { isNote, isThread, isSpace, path };
}

/**
 * Check if any panel is currently open
 */
function isPanelOpen(): boolean {
  if (typeof localStorage === 'undefined') return false;
  
  const showNewNotePanel = localStorage.getItem('showNewNotePanel') === 'true';
  const showNewThreadPanel = localStorage.getItem('showNewThreadPanel') === 'true';
  
  // Check for active panel in DOM (DesktopPanelManager sets this)
  const buttonsContainer = document.getElementById('square-buttons-container');
  const panelHidden = buttonsContainer && buttonsContainer.style.display === 'none';
  
  return showNewNotePanel || showNewThreadPanel || panelHidden || false;
}

/**
 * Navigate using Astro's View Transitions if available, otherwise use standard navigation
 */
function navigateTo(path: string): void {
  if (typeof window === 'undefined') return;
  
  // Use Astro's navigate function if available (for View Transitions)
  if ((window as any).astroNavigate) {
    (window as any).astroNavigate(path);
  } else {
    window.location.href = path;
  }
}

/**
 * Focus the search input on the search page
 */
function focusSearchInput(): void {
  if (typeof document === 'undefined') return;
  
  const searchInput = document.querySelector('input[name="q"], input[type="search"], input[role="searchbox"]') as HTMLInputElement;
  if (searchInput) {
    searchInput.focus();
    searchInput.select();
  }
}

/**
 * Handle keyboard shortcut events
 */
function handleKeyboardShortcut(event: KeyboardEvent): void {
  const modifier = isModifierPressed(event);
  const key = event.key.toLowerCase();
  const code = event.code;
  
  // Cmd/Ctrl + S - Save current note/thread (when editing)
  // Handle BEFORE isTypingInInput() check so it works in editors
  if (modifier && key === 's') {
    // Only prevent default if we're actually in an editing context
    // We'll check if there's an active editor or form
    const activeElement = document.activeElement as HTMLElement | null;
    const isInEditor = activeElement && (
      activeElement.contentEditable === 'true' ||
      activeElement.closest('.ProseMirror') !== null ||
      activeElement.closest('.tiptap-editor-container') !== null ||
      activeElement.closest('form') !== null
    );
    
    if (isInEditor || isPanelOpen()) {
      event.preventDefault();
      // Dispatch save event that components can listen to
      window.dispatchEvent(new CustomEvent('saveContent'));
    }
    return;
  }
  
  // Don't handle shortcuts when typing in inputs
  if (isTypingInInput()) {
    return;
  }
  
  // Cmd/Ctrl + N - Create new note (context-aware: only when app is focused)
  if (modifier && key === 'n' && !event.shiftKey) {
    // Only prevent default browser behavior when app is focused
    // This allows browser's "New Window" to work when address bar is focused
    if (isAppFocused()) {
      event.preventDefault();
      window.dispatchEvent(new CustomEvent('openNewNotePanel'));
    }
    return;
  }
  
  // Cmd/Ctrl + Shift + N - Create new thread (replaces Cmd/Ctrl + T to avoid browser conflict)
  if (modifier && key === 'n' && event.shiftKey) {
    event.preventDefault();
    window.dispatchEvent(new CustomEvent('openNewThreadPanel'));
    return;
  }
  
  // Cmd/Ctrl + F - Navigate to Find page or focus search input
  if (modifier && key === 'f') {
    event.preventDefault();
    const currentPath = window.location.pathname;
    if (currentPath === '/find') {
      focusSearchInput();
    } else {
      navigateTo('/find');
    }
    return;
  }
  
  // Esc - Close any open panel
  if (key === 'Escape' || code === 'Escape') {
    if (isPanelOpen()) {
      event.preventDefault();
      // Dispatch close events for all panels
      window.dispatchEvent(new CustomEvent('closeNewNotePanel'));
      window.dispatchEvent(new CustomEvent('closeNewThreadPanel'));
      window.dispatchEvent(new CustomEvent('closeNoteDetailsPanel'));
      window.dispatchEvent(new CustomEvent('closeEditThreadPanel'));
    }
    return;
  }
  
  // Note: Cmd/Ctrl + Enter is NOT used for submit/save because it's used by TiptapEditor
  // to start a new line. Use Cmd/Ctrl + S instead for saving.
  
  // Cmd/Ctrl + D - Go to dashboard
  if (modifier && key === 'd') {
    event.preventDefault();
    navigateTo('/');
    return;
  }
  
  // Cmd/Ctrl + [ or Backspace - Navigate back or to dashboard
  if ((modifier && (key === '[' || code === 'BracketLeft')) || 
      (key === 'Backspace' && !isTypingInInput())) {
    event.preventDefault();
    if (window.history.length > 1) {
      window.history.back();
    } else {
      navigateTo('/');
    }
    return;
  }
  
  // Cmd/Ctrl + I - Open details panel (context-aware)
  if (modifier && key === 'i') {
    event.preventDefault();
    const context = getPageContext();
    if (context.isNote) {
      window.dispatchEvent(new CustomEvent('openNoteDetailsPanel'));
    } else if (context.isThread) {
      window.dispatchEvent(new CustomEvent('openEditThreadPanel'));
    }
    return;
  }
  
  // Cmd/Ctrl + E - Edit current note (if viewing a note)
  if (modifier && key === 'e') {
    event.preventDefault();
    const context = getPageContext();
    if (context.isNote) {
      // Trigger edit mode - this might need to be implemented based on how editing works
      // For now, we'll dispatch an event that components can listen to
      window.dispatchEvent(new CustomEvent('editNote'));
    }
    return;
  }
}

/**
 * Initialize keyboard shortcuts
 */
export function initKeyboardShortcuts(): void {
  if (typeof window === 'undefined') return;
  
  // Remove existing listener if any (to prevent duplicates)
  const existingHandler = (window as any).__keyboardShortcutsHandler;
  if (existingHandler) {
    window.removeEventListener('keydown', existingHandler);
  }
  
  // Create new handler
  const handler = (event: KeyboardEvent) => {
    handleKeyboardShortcut(event);
  };
  
  // Store handler reference for cleanup
  (window as any).__keyboardShortcutsHandler = handler;
  
  // Add event listener
  window.addEventListener('keydown', handler);
}

/**
 * Cleanup keyboard shortcuts
 */
export function cleanupKeyboardShortcuts(): void {
  if (typeof window === 'undefined') return;
  
  const handler = (window as any).__keyboardShortcutsHandler;
  if (handler) {
    window.removeEventListener('keydown', handler);
    delete (window as any).__keyboardShortcutsHandler;
  }
}

