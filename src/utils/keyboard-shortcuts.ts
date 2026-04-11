/**
 * Keyboard Shortcuts Handler
 * 
 * Provides keyboard shortcuts for power users with context-aware behavior.
 * Shortcuts are disabled when typing in text inputs, textareas, or contenteditable elements.
 */

import { getBackTarget, popNavStack } from './nav-stack';
import { cycleTabNavStep, navigatePersistentNavStep } from './keyboard-navigation-helpers';
import { detectEntityTypeFromPath, extractIdFromPath, idToUrl } from './url-helpers';

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
  const isNote = path.startsWith('/note/');
  const isThread = path.startsWith('/thread/') || (path.startsWith('/') && path.length > 1 && !isNote && !path.startsWith('/space/') && !path.startsWith('/note/') && path !== '/' && path !== '/search' && path !== '/profile' && path !== '/sign-in' && path !== '/new-space');
  const isSpace = path.startsWith('/space/');
  
  return { isNote, isThread, isSpace, path };
}

/**
 * Check if any panel is currently open
 */
function isPanelOpen(): boolean {
  if (typeof localStorage === 'undefined') return false;

  const showNewNotePanel = localStorage.getItem('showNewNotePanel') === 'true';
  const showNewThreadPanel = localStorage.getItem('showNewThreadPanel') === 'true';
  const showNewResourcePanel = localStorage.getItem('showNewResourcePanel') === 'true';
  const showProfilePanel = !!(localStorage.getItem('showProfilePanel') || '').trim();

  // Check for active panel in DOM (DesktopPanelManager sets this)
  const buttonsContainer = document.getElementById('square-buttons-container');
  const panelHidden = buttonsContainer && buttonsContainer.style.display === 'none';

  return (
    showNewNotePanel ||
    showNewThreadPanel ||
    showNewResourcePanel ||
    showProfilePanel ||
    panelHidden ||
    false
  );
}

/** Spotlight overlay present (open or exiting animation). */
function isSpotlightOpen(): boolean {
  if (typeof document === 'undefined') return false;
  return !!document.querySelector('.spotlight-overlay:not(.spotlight-overlay--closing)');
}

/** Open desktop space switcher (`<details class="space-switcher-details">`) and focus first row. */
function openDesktopSpaceSwitcher(): void {
  if (typeof document === 'undefined') return;
  const details = document.querySelector<HTMLDetailsElement>('details.space-switcher-details');
  if (!details) return;
  details.open = true;
  requestAnimationFrame(() => {
    const first = details.querySelector<HTMLElement>(
      '.space-switcher-dropdown__scroll a.space-switcher-dropdown__item, .space-switcher-dropdown__scroll button.space-switcher-dropdown__item',
    );
    first?.focus();
  });
}

/** Close desktop space switcher if open. Used so Esc dismisses only this layer before other panels. */
function tryCloseDesktopSpaceSwitcher(): boolean {
  if (typeof document === 'undefined') return false;
  const details = document.querySelector<HTMLDetailsElement>('details.space-switcher-details');
  if (!details?.open) return false;
  details.removeAttribute('open');
  return true;
}

/**
 * Breadcrumb back: dismiss one UI layer (Spotlight → desktop panels → profile LS → new note/thread/resource LS), then caller may navigate up the hierarchy or history.
 */
function tryDismissBreadcrumbLayer(): boolean {
  if (typeof window === 'undefined') return false;

  if (isSpotlightOpen()) {
    window.dispatchEvent(new CustomEvent('closeSpotlightSearch'));
    return true;
  }

  const detail = { handled: false };
  window.dispatchEvent(new CustomEvent('breadcrumbDismissTopLayer', { detail }));
  if (detail.handled) {
    return true;
  }

  const profile = (localStorage.getItem('showProfilePanel') || '').trim();
  if (profile.length > 0) {
    window.dispatchEvent(new CustomEvent('closeProfilePanel'));
    return true;
  }

  if (localStorage.getItem('showNewResourcePanel') === 'true') {
    window.dispatchEvent(new CustomEvent('closeNewResourcePanel'));
    return true;
  }
  if (localStorage.getItem('showNewThreadPanel') === 'true') {
    window.dispatchEvent(new CustomEvent('closeNewThreadPanel'));
    return true;
  }
  if (localStorage.getItem('showNewNotePanel') === 'true') {
    window.dispatchEvent(new CustomEvent('closeNewNotePanel'));
    return true;
  }

  return false;
}

/**
 * Navigate using Astro's View Transitions if available, otherwise use standard navigation
 */
function navigateTo(path: string): void {
  if (typeof window === 'undefined') return;
  
  // Use Astro's navigate function if available (for View Transitions)
  if ((window as any).appNavigate) {
    (window as any).appNavigate(path);
  } else {
    window.location.href = path;
  }
}

/**
 * Mod+← after overlays: navigate up app hierarchy (note → thread/notes chain → space → home).
 * Returns true if navigation was handled; false to fall back to browser history.
 */
function tryHierarchyNavigateBack(): boolean {
  if (typeof window === 'undefined') return false;

  const path = window.location.pathname;
  const entity = detectEntityTypeFromPath(path);

  if (entity === 'note') {
    const currentNoteId = extractIdFromPath(path);
    if (!currentNoteId?.startsWith('note_')) return false;

    let threadId: string | null = null;
    let spaceId: string | null = null;
    try {
      const params = new URLSearchParams(window.location.search);
      const t = params.get('thread');
      if (t && t.startsWith('thread_')) threadId = t;
      const s = params.get('space');
      if (s && s.startsWith('space_')) spaceId = s;
    } catch {
      /* ignore */
    }

    if (!threadId) {
      const noteEl = document.querySelector('[data-note-id]') as HTMLElement | null;
      const tid = noteEl?.dataset.parentThreadId;
      if (tid && tid.startsWith('thread_')) threadId = tid;
      if (!spaceId) {
        const sid = noteEl?.dataset.parentThreadSpaceId;
        if (sid && sid.startsWith('space_')) spaceId = sid;
      }
    }

    if (!threadId) {
      return false;
    }

    const target = getBackTarget(currentNoteId, threadId, spaceId);
    if (target.startsWith('/note/')) {
      popNavStack(threadId);
    }
    navigateTo(target);
    return true;
  }

  if (entity === 'thread') {
    let spaceId: string | null = null;
    try {
      const s = new URLSearchParams(window.location.search).get('space');
      if (s && s.startsWith('space_')) spaceId = s;
    } catch {
      /* ignore */
    }
    if (spaceId) {
      navigateTo(idToUrl(spaceId));
    } else {
      navigateTo('/');
    }
    return true;
  }

  if (entity === 'space') {
    navigateTo('/');
    return true;
  }

  return false;
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
  // Guard against undefined event.key (can happen in edge cases)
  if (!event.key) {
    return;
  }
  
  const modifier = isModifierPressed(event);
  const key = event.key.toLowerCase();
  const code = event.code;
  
  // Cmd/Ctrl + K - Spotlight search (handle before isTypingInInput so it works in editors, like other apps)
  if (modifier && key === 'k') {
    event.preventDefault();
    window.dispatchEvent(new CustomEvent('openSpotlightSearch'));
    return;
  }

  // Cmd/Ctrl + S - Save current note/thread (when editing)
  // Handle BEFORE isTypingInInput() check so it works in editors
  // Cmd/Ctrl + Option + S is reserved for "open space switcher" (handled after isTypingInInput).
  if (modifier && key === 's' && !event.altKey) {
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

  // Esc — space switcher first (only that layer), then other overlays/panels (before isTypingInInput)
  if (key === 'escape' || code === 'Escape') {
    if (tryCloseDesktopSpaceSwitcher()) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if (tryDismissBreadcrumbLayer()) {
      event.preventDefault();
    }
    return;
  }

  // Don't handle shortcuts when typing in inputs
  if (isTypingInInput()) {
    return;
  }

  // Cmd/Ctrl + Option — persistent nav, tabs, space switcher (not when Spotlight is open)
  // Use KeyS so Alt+letter layouts still match the physical S key; capture phase + stopImmediatePropagation
  // so the browser does not also run its own shortcut (e.g. tab history or OS workspace switching).
  if (modifier && event.altKey && !event.shiftKey) {
    if (!isSpotlightOpen()) {
      const isPhysicalS = key === 's' || code === 'KeyS';
      if (isPhysicalS && !event.repeat) {
        event.preventDefault();
        event.stopImmediatePropagation();
        openDesktopSpaceSwitcher();
        return;
      }
      if (key === 'arrowup' || code === 'ArrowUp') {
        if (navigatePersistentNavStep(-1)) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
        return;
      }
      if (key === 'arrowdown' || code === 'ArrowDown') {
        if (navigatePersistentNavStep(1)) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
        return;
      }
      if (key === 'arrowleft' || code === 'ArrowLeft') {
        if (cycleTabNavStep(-1)) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
        return;
      }
      if (key === 'arrowright' || code === 'ArrowRight') {
        if (cycleTabNavStep(1)) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
        return;
      }
    }
  }

  // Cmd/Ctrl + Alt + N — New note (Alt avoids browser New Window on ⌘/Ctrl+N)
  if (modifier && event.altKey && key === 'n' && !event.shiftKey) {
    if (isAppFocused()) {
      event.preventDefault();
      window.dispatchEvent(new CustomEvent('openNewNotePanel'));
    }
    return;
  }

  // Cmd/Ctrl + Alt + Shift + N — New thread (avoids browser incognito / new-window chords)
  if (modifier && event.altKey && key === 'n' && event.shiftKey) {
    event.preventDefault();
    window.dispatchEvent(new CustomEvent('openNewThreadPanel'));
    return;
  }
  
  // Note: Cmd/Ctrl + Enter is used for submitting forms in creation panels (NewNotePanel,
  // NewThreadPanel, NewSpacePanel). TiptapEditor dispatches 'submitPanelForm' event which
  // the panels listen for. Each panel also handles Cmd+Enter on its form element directly.
  
  // Cmd/Ctrl + Shift + H — Home (root / dashboard route)
  if (modifier && event.shiftKey && key === 'h') {
    event.preventDefault();
    navigateTo('/');
    return;
  }

  // Cmd/Ctrl + Left Arrow — close top overlay/panel first, else hierarchy up (note → thread → space → home), else history
  // (Cmd/Ctrl + Option + Left is used for content tab cycling; handled earlier.)
  if (modifier && !event.altKey && (key === 'arrowleft' || code === 'ArrowLeft')) {
    event.preventDefault();
    if (tryDismissBreadcrumbLayer()) {
      return;
    }
    if (tryHierarchyNavigateBack()) {
      return;
    }
    if (window.history.length > 1) {
      window.history.back();
    } else {
      navigateTo('/');
    }
    return;
  }
  
  // Cmd/Ctrl + D — Details: note details or thread edit panel (context-aware). Avoids I vs l in the key legend.
  if (modifier && key === 'd' && !event.shiftKey) {
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
const KEYDOWN_LISTENER_OPTIONS: AddEventListenerOptions = { capture: true };

export function initKeyboardShortcuts(): void {
  if (typeof window === 'undefined') return;

  // Remove existing listener if any (to prevent duplicates)
  const existingHandler = (window as any).__keyboardShortcutsHandler;
  if (existingHandler) {
    window.removeEventListener('keydown', existingHandler, KEYDOWN_LISTENER_OPTIONS);
  }

  const handler = (event: KeyboardEvent) => {
    handleKeyboardShortcut(event);
  };

  (window as any).__keyboardShortcutsHandler = handler;

  // Capture phase so we can preventDefault / stopImmediatePropagation before browser shortcuts
  window.addEventListener('keydown', handler, KEYDOWN_LISTENER_OPTIONS);
}

/** Modifier label for display (preferences / help). */
export function getKeyboardShortcutModifierLabel(): '⌘' | 'Ctrl' {
  if (typeof navigator === 'undefined') return '⌘';
  const ua = navigator.userAgent;
  const platform = typeof navigator.platform === 'string' ? navigator.platform : '';
  return /Mac|iPhone|iPad|iPod/i.test(ua) || platform.includes('Mac') ? '⌘' : 'Ctrl';
}

export type KeyboardShortcutReferenceItem = {
  /** Short label for the action */
  action: string;
  /**
   * One string per key cap, same pattern as Spotlight’s action strip (`<kbd>⌘</kbd> + <kbd>K</kbd>`).
   */
  keyParts: string[];
};

/**
 * Human-readable list of app shortcuts (keep in sync with handleKeyboardShortcut and editor/panel handlers).
 * Order: navigate (search / home / back) → create → view & edit → dismiss.
 */
export function getKeyboardShortcutsReference(): KeyboardShortcutReferenceItem[] {
  const mod = getKeyboardShortcutModifierLabel();
  const isMac = mod === '⌘';
  const opt = isMac ? '⌥' : 'Alt';

  return [
    { action: 'Search', keyParts: [mod, 'K'] },
    { action: 'Home', keyParts: isMac ? [mod, '⇧', 'H'] : ['Ctrl', 'Shift', 'H'] },
    {
      action: 'Back',
      keyParts: isMac ? [mod, '←'] : ['Ctrl', '←'],
    },
    { action: 'Cycle open items', keyParts: isMac ? [mod, opt, '↑ / ↓'] : ['Ctrl', 'Alt', '↑ / ↓'] },
    { action: 'Switch tab', keyParts: isMac ? [mod, opt, '← / →'] : ['Ctrl', 'Alt', '← / →'] },
    { action: 'Switch space', keyParts: isMac ? [mod, opt, 'S'] : ['Ctrl', 'Alt', 'S'] },
    { action: 'Move in list', keyParts: ['↑', '↓'] },
    { action: 'New note', keyParts: isMac ? [mod, '⌥', 'N'] : ['Ctrl', 'Alt', 'N'] },
    { action: 'New thread', keyParts: isMac ? [mod, '⌥', '⇧', 'N'] : ['Ctrl', 'Alt', 'Shift', 'N'] },
    {
      action: 'Create',
      keyParts: isMac ? [mod, '↵'] : ['Ctrl', 'Enter'],
    },
    { action: 'Details', keyParts: [mod, 'D'] },
    { action: 'Edit note', keyParts: [mod, 'E'] },
    { action: 'Save', keyParts: [mod, 'S'] },
    { action: 'Dismiss', keyParts: ['Esc'] },
  ];
}

/**
 * Cleanup keyboard shortcuts
 */
export function cleanupKeyboardShortcuts(): void {
  if (typeof window === 'undefined') return;

  const handler = (window as any).__keyboardShortcutsHandler;
  if (handler) {
    window.removeEventListener('keydown', handler, KEYDOWN_LISTENER_OPTIONS);
    delete (window as any).__keyboardShortcutsHandler;
  }
}

