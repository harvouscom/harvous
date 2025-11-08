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
  
  const activeElement = document.activeElement;
  if (!activeElement) return false;
  
  const tagName = activeElement.tagName.toLowerCase();
  
  // Check for input fields (excluding buttons, checkboxes, etc.)
  const isInput = tagName === 'input' && 
    (activeElement.type === 'text' || 
     activeElement.type === 'search' || 
     activeElement.type === 'email' || 
     activeElement.type === 'password' ||
     activeElement.type === 'url' ||
     activeElement.type === 'tel' ||
     !activeElement.type); // default type is text
  
  const isTextarea = tagName === 'textarea';
  const isContentEditable = activeElement.contentEditable === 'true';
  
  return isInput || isTextarea || isContentEditable;
}

/**
 * Check if a modifier key is pressed (Cmd on Mac, Ctrl on Windows/Linux)
 */
function isModifierPressed(event: KeyboardEvent): boolean {
  return event.metaKey || event.ctrlKey;
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
  const isThread = path.startsWith('/thread_') || (path.startsWith('/') && path.length > 1 && !isNote && !path.startsWith('/space_') && path !== '/dashboard' && path !== '/search' && path !== '/profile' && path !== '/sign-in' && path !== '/sign-up' && path !== '/welcome' && path !== '/new-space');
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
  // Don't handle shortcuts when typing in inputs
  if (isTypingInInput()) {
    return;
  }
  
  const modifier = isModifierPressed(event);
  const key = event.key.toLowerCase();
  const code = event.code;
  
  // Cmd/Ctrl + N - Create new note
  if (modifier && key === 'n') {
    event.preventDefault();
    window.dispatchEvent(new CustomEvent('openNewNotePanel'));
    return;
  }
  
  // Cmd/Ctrl + T - Create new thread
  if (modifier && key === 't') {
    event.preventDefault();
    window.dispatchEvent(new CustomEvent('openNewThreadPanel'));
    return;
  }
  
  // Cmd/Ctrl + F - Navigate to Find page or focus search input
  if (modifier && key === 'f') {
    event.preventDefault();
    const currentPath = window.location.pathname;
    if (currentPath === '/search') {
      focusSearchInput();
    } else {
      navigateTo('/search');
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
    navigateTo('/dashboard');
    return;
  }
  
  // Cmd/Ctrl + [ or Backspace - Navigate back or to dashboard
  if ((modifier && (key === '[' || code === 'BracketLeft')) || 
      (key === 'Backspace' && !isTypingInInput())) {
    event.preventDefault();
    if (window.history.length > 1) {
      window.history.back();
    } else {
      navigateTo('/dashboard');
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
  
  // Cmd/Ctrl + S - Save current note/thread (when editing)
  if (modifier && key === 's') {
    // Only prevent default if we're actually in an editing context
    // We'll check if there's an active editor or form
    const activeElement = document.activeElement;
    const isInEditor = activeElement && (
      activeElement.contentEditable === 'true' ||
      activeElement.closest('[data-tiptap-editor]') !== null ||
      activeElement.closest('form') !== null
    );
    
    if (isInEditor || isPanelOpen()) {
      event.preventDefault();
      // Try to find and submit the active form or trigger save
      const activeForm = document.querySelector('form[data-panel-form]') as HTMLFormElement;
      if (activeForm) {
        activeForm.requestSubmit();
      } else {
        // Dispatch save event that components can listen to
        window.dispatchEvent(new CustomEvent('saveContent'));
      }
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

