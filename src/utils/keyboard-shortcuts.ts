/**
 * Keyboard Shortcuts Handler
 * 
 * Provides keyboard shortcuts for power users with context-aware behavior.
 * Shortcuts are disabled when typing in text inputs, textareas, or contenteditable elements.
 */

import { getBackTarget, popNavStack } from './nav-stack';
import { cycleTabNavStep, navigatePersistentNavStep } from './keyboard-navigation-helpers';
import { detectEntityTypeFromPath, extractIdFromPath, idToUrl } from './url-helpers';

/** Second press of the same browser-conflicting shortcut within this window lets the browser handle it. */
const PASSTHROUGH_WINDOW_MS = 600;

let lastIntercepted: { shortcutId: string; time: number } | null = null;

/**
 * For shortcuts that shadow browser defaults: first press is for the app; a second press of the
 * same shortcutId within the window passes through (no preventDefault). Use a stable id per chord
 * (e.g. mod-arrowleft vs mod-alt-arrowleft) so physical key codes do not collide across modifiers.
 * Key repeat never passes through so held keys keep app behavior.
 */
function shouldPassThroughToBrowser(event: KeyboardEvent, shortcutId: string): boolean {
  if (event.repeat) return false;
  const now = Date.now();
  if (lastIntercepted && lastIntercepted.shortcutId === shortcutId && now - lastIntercepted.time < PASSTHROUGH_WINDOW_MS) {
    lastIntercepted = null;
    return true;
  }
  lastIntercepted = { shortcutId, time: now };
  return false;
}

/**
 * Check if user is currently typing in an input field
 */
export function isTypingInInput(): boolean {
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
export function openDesktopSpaceSwitcher(): void {
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
 * Handle keyboard shortcut events
 */
function handleKeyboardShortcut(event: KeyboardEvent): void {
  // Guard against missing key info; `key` can be empty/Dead with Option/Alt held (use `code` for physical keys)
  if (!event.key && !event.code) {
    return;
  }

  const modifier = isModifierPressed(event);
  const key = event.key ? event.key.toLowerCase() : '';
  const code = event.code;
  
  // Cmd/Ctrl + K — Spotlight search (handle before isTypingInInput so it works in editors, like other apps)
  if (modifier && key === 'k' && !event.altKey) {
    if (shouldPassThroughToBrowser(event, 'mod-k')) return;
    event.preventDefault();
    window.dispatchEvent(new CustomEvent('openSpotlightSearch'));
    return;
  }

  // Cmd/Ctrl + S - Save current note/thread (when editing)
  // Handle BEFORE isTypingInInput() check so it works in editors
  // Cmd/Ctrl + Option + S is reserved for "open space switcher" (handled after isTypingInInput).
  if (modifier && key === 's' && !event.altKey && !event.shiftKey) {
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
      if (shouldPassThroughToBrowser(event, 'mod-s')) return;
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

  // Cmd/Ctrl + ' — New note (right hand: Quote key; beside ; on US QWERTY; left hand on modifier)
  if (modifier && !event.shiftKey && !event.altKey && code === 'Quote') {
    event.preventDefault();
    event.stopImmediatePropagation();
    window.dispatchEvent(new CustomEvent('openNewNotePanel'));
    return;
  }

  // Cmd/Ctrl + ; — New thread (right hand; adjacent to ' on US QWERTY)
  if (modifier && !event.shiftKey && !event.altKey && code === 'Semicolon') {
    event.preventDefault();
    event.stopImmediatePropagation();
    window.dispatchEvent(new CustomEvent('openNewThreadPanel'));
    return;
  }

  // Don't handle shortcuts when typing in inputs
  if (isTypingInInput()) {
    return;
  }

  // Enter on active-space nav link (cycle target): open space switcher instead of activating the link
  if ((key === 'enter' || code === 'Enter') && !modifier && !event.altKey) {
    const el = document.activeElement as HTMLElement | null;
    if (el?.getAttribute('data-open-space-switcher-on-enter') === 'true') {
      event.preventDefault();
      event.stopImmediatePropagation();
      openDesktopSpaceSwitcher();
      return;
    }
  }

  // Cmd/Ctrl + Option — persistent nav (brackets cycle items; avoids ⌥↑/↓ vs browser tab shortcuts), tabs, space switcher (not when Spotlight is open)
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
      if (code === 'BracketLeft') {
        if (navigatePersistentNavStep(-1)) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
        return;
      }
      if (code === 'BracketRight') {
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
    if (shouldPassThroughToBrowser(event, 'mod-arrowleft')) return;
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
  
  // Cmd/Ctrl + Shift + D — Details: note details or thread edit panel (context-aware)
  if (modifier && event.shiftKey && key === 'd' && !event.altKey) {
    if (shouldPassThroughToBrowser(event, 'mod-shift-d')) return;
    event.preventDefault();
    const context = getPageContext();
    if (context.isNote) {
      window.dispatchEvent(new CustomEvent('openNoteDetailsPanel'));
    } else if (context.isThread) {
      window.dispatchEvent(new CustomEvent('openEditThreadPanel'));
    }
    return;
  }

  // Cmd/Ctrl + Shift + S — Share (note or thread; same as Edit → Share)
  if (modifier && event.shiftKey && key === 's' && !event.altKey) {
    if (shouldPassThroughToBrowser(event, 'mod-shift-s')) return;
    event.preventDefault();
    const path = window.location.pathname;
    const entity = detectEntityTypeFromPath(path);
    const id = extractIdFromPath(path);
    if (entity === 'note' && id?.startsWith('note_')) {
      window.dispatchEvent(
        new CustomEvent('openNoteSharePanel', { detail: { contentId: id, contentType: 'note' } }),
      );
    } else if (entity === 'thread' && id?.startsWith('thread_')) {
      window.dispatchEvent(
        new CustomEvent('openNoteSharePanel', { detail: { contentId: id, contentType: 'thread' } }),
      );
    }
    return;
  }

  // Cmd/Ctrl + Shift + L — Lock (note only; same as Edit → Lock / focus lock control)
  if (modifier && event.shiftKey && key === 'l' && !event.altKey) {
    if (shouldPassThroughToBrowser(event, 'mod-shift-l')) return;
    event.preventDefault();
    const id = extractIdFromPath(window.location.pathname);
    if (id?.startsWith('note_')) {
      window.dispatchEvent(new CustomEvent('focusLockNote', { detail: { contentId: id } }));
    }
    return;
  }

  // Cmd/Ctrl + Shift + E — Edit (context-aware: note → edit mode, thread/space → edit panel)
  if (modifier && event.shiftKey && key === 'e' && !event.altKey) {
    if (shouldPassThroughToBrowser(event, 'mod-shift-e')) return;
    event.preventDefault();
    const path = window.location.pathname;
    const entity = detectEntityTypeFromPath(path);
    const id = extractIdFromPath(path);
    if (entity === 'note' && id?.startsWith('note_')) {
      window.dispatchEvent(new CustomEvent('editNote'));
    } else if (entity === 'thread' && id?.startsWith('thread_')) {
      window.dispatchEvent(
        new CustomEvent('openEditThreadPanel', { detail: { contentId: id, contentType: 'thread' } }),
      );
    } else if (entity === 'space' && id?.startsWith('space_')) {
      window.dispatchEvent(
        new CustomEvent('openEditSpacePanel', { detail: { contentId: id, contentType: 'space' } }),
      );
    }
    return;
  }

  // Cmd/Ctrl + Delete — open erase confirmation (note / space / thread; thread uses "erase thread" / keep notes)
  if (modifier && (key === 'delete' || code === 'Delete')) {
    event.preventDefault();
    window.dispatchEvent(new CustomEvent('keyboardShortcutErase'));
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

export type KeyboardShortcutReferenceGroup = {
  heading: string;
  items: KeyboardShortcutReferenceItem[];
};

/**
 * Grouped shortcuts for preferences / help UI (keep in sync with handleKeyboardShortcut and editor/panel handlers).
 * Order: Add → Edit → Navigate.
 */
export function getKeyboardShortcutsReference(): KeyboardShortcutReferenceGroup[] {
  const mod = getKeyboardShortcutModifierLabel();
  const isMac = mod === '⌘';
  const opt = isMac ? '⌥' : 'Alt';

  return [
    {
      heading: 'Add',
      items: [
        { action: 'New note', keyParts: [mod, "'"] },
        { action: 'New thread', keyParts: [mod, ';'] },
        {
          action: 'Create',
          keyParts: isMac ? [mod, '↵'] : ['Ctrl', 'Enter'],
        },
      ],
    },
    {
      heading: 'Edit',
      items: [
        { action: 'Details', keyParts: isMac ? [mod, '⇧', 'D'] : ['Ctrl', 'Shift', 'D'] },
        { action: 'Share', keyParts: isMac ? [mod, '⇧', 'S'] : ['Ctrl', 'Shift', 'S'] },
        { action: 'Lock', keyParts: isMac ? [mod, '⇧', 'L'] : ['Ctrl', 'Shift', 'L'] },
        { action: 'Edit', keyParts: isMac ? [mod, '⇧', 'E'] : ['Ctrl', 'Shift', 'E'] },
        { action: 'Save', keyParts: [mod, 'S'] },
        { action: 'Dismiss', keyParts: ['Esc'] },
        { action: 'Erase', keyParts: [mod, isMac ? '⌦' : 'Del'] },
      ],
    },
    {
      heading: 'Navigate',
      items: [
        { action: 'Search', keyParts: [mod, 'K'] },
        { action: 'Home', keyParts: isMac ? [mod, '⇧', 'H'] : ['Ctrl', 'Shift', 'H'] },
        {
          action: 'Back',
          keyParts: isMac ? [mod, '←'] : ['Ctrl', '←'],
        },
        { action: 'Cycle open items', keyParts: isMac ? [mod, opt, '[ / ]'] : ['Ctrl', 'Alt', '[ / ]'] },
        { action: 'Switch tab', keyParts: isMac ? [mod, opt, '← / →'] : ['Ctrl', 'Alt', '← / →'] },
        { action: 'Switch space', keyParts: isMac ? [mod, opt, 'S'] : ['Ctrl', 'Alt', 'S'] },
        { action: 'Move in list', keyParts: ['↑', '↓'] },
      ],
    },
  ];
}

/**
 * Cleanup keyboard shortcuts
 */
export function cleanupKeyboardShortcuts(): void {
  if (typeof window === 'undefined') return;

  lastIntercepted = null;

  const handler = (window as any).__keyboardShortcutsHandler;
  if (handler) {
    window.removeEventListener('keydown', handler, KEYDOWN_LISTENER_OPTIONS);
    delete (window as any).__keyboardShortcutsHandler;
  }
}

