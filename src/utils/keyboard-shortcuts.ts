/**
 * Keyboard Shortcuts Handler
 * 
 * Provides keyboard shortcuts for power users with context-aware behavior.
 * Shortcuts are disabled when typing in text inputs, textareas, or contenteditable elements.
 */

import { getBackTarget, popNavStack } from './nav-stack';
import { cycleTabNavStep, navigatePersistentNavStep } from './keyboard-navigation-helpers';
import { detectEntityTypeFromPath, extractIdFromPath, idToUrl } from './url-helpers';
import { decodeNoteSlug } from './ids';
import {
  isPrototypeNotePath,
  isPrototypeShellPath,
  matchPrototypeNoteId,
  prototypeHomePath,
  prototypeSettingsRouteTo,
} from '@/lib/prototype-path';
/* Pure table — no React reaches this early-loading module. See `prototype-commands.ts`. */
import { PROTOTYPE_COMMANDS } from '../../spa/src/lib/prototype-commands';

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

function isPrototypeRoute(path: string): boolean {
  return isPrototypeShellPath(path);
}

function isPrototypeNoteRoute(path: string): boolean {
  return isPrototypeNotePath(path);
}

function isElementInEditorContext(activeElement: HTMLElement | null): boolean {
  if (!activeElement) return false;
  return (
    activeElement.contentEditable === 'true' ||
    activeElement.closest('.ProseMirror') !== null ||
    activeElement.closest('.tiptap-editor-container') !== null ||
    activeElement.closest('form') !== null
  );
}

/** Prototype Shift+key shortcuts defer to any active text field (title, body, search, etc.). */
function isPrototypeTypingContext(event: KeyboardEvent): boolean {
  if (isTypingInInput()) return true;
  const activeElement = document.activeElement as HTMLElement | null;
  if (isElementInEditorContext(activeElement)) return true;
  const target = event.target as HTMLElement | null;
  if (!target) return false;
  return (
    target.closest('.ProseMirror') !== null ||
    target.closest('.tiptap-editor-container') !== null ||
    target.closest('[data-card-full-editable][data-editing]') !== null
  );
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

function extractPrototypeNoteId(path: string): string | null {
  const slug = matchPrototypeNoteId(path);
  if (!slug) return null;
  return decodeNoteSlug(slug);
}

/** Hold Shift alone this long (ms) to show toolbar key hints without firing a shortcut. */
export const PROTOTYPE_SHIFT_HINT_HOLD_MS = 400;

function isPrototypeShiftChord(event: KeyboardEvent): boolean {
  return event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey && event.key !== 'Shift';
}

/**
 * Shift+letter → the verb the sidebar should try against its selection, or against the
 * row that currently holds keyboard focus. Backspace maps to `delete` alongside these.
 *
 * `select` and `selectAll` are selection itself rather than organizing, but they travel
 * the same event because the sidebar needs the same "which list, which row" answer to act
 * on any of them.
 */
const PROTOTYPE_LIST_VERB_KEYS: Readonly<Record<string, string | undefined>> = {
  x: 'select',
  a: 'selectAll',
  m: 'folder',
  t: 'thread',
  p: 'pin',
};

function handlePrototypeKeyboardShortcut(event: KeyboardEvent): boolean {
  if (typeof window === 'undefined') return false;

  const modifier = isModifierPressed(event);
  const key = event.key ? event.key.toLowerCase() : '';
  const code = event.code;
  const path = window.location.pathname;
  const activeElement = document.activeElement as HTMLElement | null;
  const inEditor = isElementInEditorContext(activeElement);

  // Shift + letter/symbol — prototype power shortcuts (typing contexts keep Shift for capitals).
  if (isPrototypeShiftChord(event)) {
    if (isPrototypeTypingContext(event)) return false;

    if (key === 'n') {
      event.preventDefault();
      event.stopImmediatePropagation();
      window.dispatchEvent(new CustomEvent('prototypeShortcutNewNote'));
      return true;
    }
    /**
     * Opens the Library panel with its field focused. The event name is a fossil: it used to
     * summon `PrototypeCommandPalette`, which has since merged into the panel — the tabs are
     * the browsing, the query is the retrieval, and the organize verbs are an Actions group
     * above the results. The name is kept because `library-panel/__tests__/palette-retired.test.ts`
     * asserts the shell still listens for it, so the chord cannot be quietly unhooked.
     */
    if (key === 'k') {
      event.preventDefault();
      event.stopImmediatePropagation();
      window.dispatchEvent(new CustomEvent('prototypeShortcutOpenCommandPalette'));
      return true;
    }
    if (event.key === ',') {
      event.preventDefault();
      navigateTo(prototypeSettingsRouteTo());
      return true;
    }
    if (key === 's') {
      event.preventDefault();
      event.stopImmediatePropagation();
      window.dispatchEvent(new CustomEvent('prototypeShortcutToggleSidebar'));
      return true;
    }
    if (key === 'h') {
      event.preventDefault();
      event.stopImmediatePropagation();
      window.dispatchEvent(new CustomEvent('prototypeShortcutShowHome'));
      return true;
    }
    if (key === 'l') {
      event.preventDefault();
      event.stopImmediatePropagation();
      window.dispatchEvent(new CustomEvent('prototypeShortcutShowList'));
      return true;
    }
    if (key === 'j') {
      event.preventDefault();
      window.dispatchEvent(new CustomEvent('prototypeShortcutFocusNoteList'));
      return true;
    }
    if (key === 'r') {
      event.preventDefault();
      event.stopImmediatePropagation();
      window.dispatchEvent(new CustomEvent('prototypeShortcutOpenReader'));
      return true;
    }
    /**
     * Selecting and organizing from the keyboard.
     *
     * One event for all of them rather than six, because the decision they need — is a
     * selection standing, or is a row merely focused, and may this verb act on it — lives
     * in the sidebar with the selection state and the sheets. Here we only name the verb.
     *
     * `f` is not among them on purpose: it is Find-in-note on note routes, and a note can
     * be open while the sidebar holds a selection. `b` is left alone because native binds
     * it to the sidebar toggle.
     */
    const listVerb = PROTOTYPE_LIST_VERB_KEYS[key] ?? (key === 'backspace' ? 'delete' : null);
    if (listVerb) {
      event.preventDefault();
      event.stopImmediatePropagation();
      window.dispatchEvent(
        new CustomEvent('prototypeShortcutListVerb', { detail: { verb: listVerb } }),
      );
      return true;
    }
    if (isPrototypeNoteRoute(path)) {
      const noteId = extractPrototypeNoteId(path);
      if (key === 'f' && noteId) {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent('prototypeOpenFindInNote', { detail: { noteId } }));
        return true;
      }
      if (key === 'd') {
        event.preventDefault();
        event.stopImmediatePropagation();
        window.dispatchEvent(new CustomEvent('prototypeShortcutToggleInspector'));
        return true;
      }
    }
    if (code === 'ArrowLeft') {
      event.preventDefault();
      event.stopImmediatePropagation();
      window.dispatchEvent(new CustomEvent('prototypeShortcutCycleListMode', { detail: { step: -1 } }));
      return true;
    }
    if (code === 'ArrowRight') {
      event.preventDefault();
      event.stopImmediatePropagation();
      window.dispatchEvent(new CustomEvent('prototypeShortcutCycleListMode', { detail: { step: 1 } }));
      return true;
    }
    if (code === 'ArrowUp') {
      event.preventDefault();
      event.stopImmediatePropagation();
      window.dispatchEvent(new CustomEvent('prototypeShortcutMoveInList', { detail: { step: -1 } }));
      return true;
    }
    if (code === 'ArrowDown') {
      event.preventDefault();
      event.stopImmediatePropagation();
      window.dispatchEvent(new CustomEvent('prototypeShortcutMoveInList', { detail: { step: 1 } }));
      return true;
    }
  }

  /*
   * Cmd/Ctrl + F is deliberately *not* bound: it belongs to the browser's find-in-page, and a
   * document app is exactly where someone reaches for that. ⇧K opens the Library panel's search
   * — searching the library rather than the page in front of you — and that is the only chord
   * for it, so the toolbar chip can name one key rather than two.
   */

  // Cmd/Ctrl + S — save in editor/forms.
  if (modifier && key === 's' && !event.altKey && !event.shiftKey) {
    const activeElement = document.activeElement as HTMLElement | null;
    if (isElementInEditorContext(activeElement) || isPanelOpen()) {
      if (shouldPassThroughToBrowser(event, 'prototype-mod-s')) return true;
      event.preventDefault();
      window.dispatchEvent(new CustomEvent('saveContent'));
    }
    return true;
  }

  // Cmd/Ctrl + Left Arrow — back navigation (not Shift — keeps Shift free for shortcuts/hints).
  if (modifier && !event.altKey && !event.shiftKey && (key === 'arrowleft' || code === 'ArrowLeft')) {
    if (shouldPassThroughToBrowser(event, 'prototype-mod-arrowleft')) return true;
    event.preventDefault();

    const settingsRoot = prototypeSettingsRouteTo();
    if (path.startsWith(`${settingsRoot}/`)) {
      navigateTo(settingsRoot);
      return true;
    }
    if (path === settingsRoot || path === `${settingsRoot}/`) {
      navigateTo(prototypeHomePath());
      return true;
    }
    if (isPrototypeNotePath(path)) {
      navigateTo(prototypeHomePath());
      return true;
    }
    if (window.history.length > 1) {
      window.history.back();
    } else {
      navigateTo(prototypeHomePath());
    }
    return true;
  }

  // Let Esc and all remaining keys fall through to local prototype handlers.
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
  const path = typeof window !== 'undefined' ? window.location.pathname : '';

  if (isPrototypeRoute(path)) {
    if (handlePrototypeKeyboardShortcut(event)) return;
    // Prototype uses Shift+key shortcuts; suppress production Cmd+Shift chords here.
    if (isModifierPressed(event) && event.shiftKey) return;
  }
  
  // Cmd/Ctrl + K — Spotlight search (handle before isTypingInInput so it works in editors, like other apps)
  if (modifier && key === 'k' && !event.altKey) {
    if (isPrototypeRoute(path)) return;
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
    const isInEditor = isElementInEditorContext(activeElement);
    
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
    } else if (entity === 'space' && id?.startsWith('space_')) {
      window.dispatchEvent(
        new CustomEvent('openNoteSharePanel', { detail: { contentId: id, contentType: 'space' } }),
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
 * Prototype-specific shortcuts shown in `/prototype/settings/keyboard-shortcuts`.
 * Keep in sync with `handlePrototypeKeyboardShortcut`.
 */
export function getPrototypeKeyboardShortcutsReference(): KeyboardShortcutReferenceGroup[] {
  const shift = '⇧';

  return [
    {
      heading: 'General',
      items: [
        { action: 'New note', keyParts: [shift, 'N'] },
        { action: 'Read the Bible', keyParts: [shift, 'R'] },
        { action: 'Search the Library', keyParts: [shift, 'K'] },
        { action: 'Settings', keyParts: [shift, ','] },
        { action: 'Toggle sidebar', keyParts: [shift, 'S'] },
        { action: 'Show Activity', keyParts: [shift, 'H'] },
        { action: 'Open the Library', keyParts: [shift, 'L'] },
        { action: 'Focus the list', keyParts: [shift, 'J'] },
        { action: 'Dismiss', keyParts: ['Esc'] },
      ],
    },
    {
      /**
       * "Browsing" rather than "Sidebar": ⇧K and ⇧L both open the Library panel now, and
       * ⇧← / ⇧→ cycles whichever of the two surfaces is up. A heading naming only the rail
       * would send the reader to the one these keys mostly do not reach.
       *
       * `Home / End → Jump to first / last` used to sit here and was never bound — the only
       * Home/End handler on a prototype route is the sidebar's resize grip. A reference page
       * that advertises a chord nothing answers is worse than one that omits it.
       */
      heading: 'Browsing',
      items: [
        { action: 'Cycle sections', keyParts: [shift, '← / →'] },
        { action: 'Move in list', keyParts: [shift, '↑ / ↓'] },
        { action: 'Open item', keyParts: ['Enter'] },
        { action: 'Back', keyParts: [getKeyboardShortcutModifierLabel(), '←'] },
      ],
    },
    {
      /**
       * Derived from the command table rather than restated, so a verb cannot exist as a
       * chord without appearing here. The two lists used to be independent, and this one
       * had already drifted — it was missing ⌘← above.
       *
       * These act on the selection when one stands, and on the row holding keyboard focus
       * when none does.
       */
      heading: 'Organize',
      items: [
        { action: 'Select focused row', keyParts: [shift, 'X'] },
        { action: 'Select all / none', keyParts: [shift, 'A'] },
        ...PROTOTYPE_COMMANDS.filter((command) => command.keys).map((command) => ({
          action: command.referenceLabel,
          keyParts: [...command.keys],
        })),
      ],
    },
    {
      heading: 'Note',
      items: [
        { action: 'Find in note', keyParts: [shift, 'F'] },
        { action: 'Note details', keyParts: [shift, 'D'] },
        { action: 'Save', keyParts: [getKeyboardShortcutModifierLabel(), 'S'] },
        { action: 'New paragraph', keyParts: ['Enter'] },
        { action: 'Line break in paragraph', keyParts: [shift, 'Enter'] },
        { action: 'Title to body', keyParts: ['Enter'] },
      ],
    },
  ];
}

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

