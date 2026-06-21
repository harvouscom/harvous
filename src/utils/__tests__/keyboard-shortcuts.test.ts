/**
 * Integration tests for the global keyboard shortcut handler.
 *
 * These drive the real `initKeyboardShortcuts()` listener (capture-phase keydown on
 * window) in jsdom and assert that each chord dispatches the CustomEvent it advertises
 * in `getKeyboardShortcutsReference()` / `getPrototypeKeyboardShortcutsReference()`,
 * or navigates via `window.appNavigate`. Keep in sync with `keyboard-shortcuts.ts`.
 */

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import {
  initKeyboardShortcuts,
  cleanupKeyboardShortcuts,
} from '../keyboard-shortcuts';

type KeyInit = {
  key?: string;
  code?: string;
  meta?: boolean;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
};

/**
 * Dispatch a synthetic keydown. Real keydown events always target a focused element
 * (defaulting to <body>), so we dispatch on the active element / body and let it
 * propagate to the capture-phase handler on window — mirroring the browser.
 */
function press(init: KeyInit): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key: init.key,
    code: init.code,
    metaKey: init.meta ?? false,
    ctrlKey: init.ctrl ?? false,
    shiftKey: init.shift ?? false,
    altKey: init.alt ?? false,
    bubbles: true,
    cancelable: true,
  });
  const target =
    document.activeElement instanceof HTMLElement && document.activeElement !== document.body
      ? document.activeElement
      : document.body;
  target.dispatchEvent(event);
  return event;
}

/** Run `fn`, asserting it caused exactly one window CustomEvent of `name` to fire. */
function expectEvent(name: string, fn: () => void): CustomEvent {
  let received: CustomEvent | null = null;
  const listener = (e: Event) => {
    received = e as CustomEvent;
  };
  window.addEventListener(name, listener);
  try {
    fn();
  } finally {
    window.removeEventListener(name, listener);
  }
  expect(received, `expected CustomEvent "${name}" to fire`).not.toBeNull();
  return received as unknown as CustomEvent;
}

/** Assert `fn` fires no event of `name`. */
function expectNoEvent(name: string, fn: () => void): void {
  let fired = false;
  const listener = () => {
    fired = true;
  };
  window.addEventListener(name, listener);
  try {
    fn();
  } finally {
    window.removeEventListener(name, listener);
  }
  expect(fired, `expected CustomEvent "${name}" NOT to fire`).toBe(false);
}

function setPath(pathname: string, search = ''): void {
  window.history.pushState({}, '', `${pathname}${search}`);
}

let appNavigate: ReturnType<typeof vi.fn>;

beforeEach(() => {
  cleanupKeyboardShortcuts();
  initKeyboardShortcuts();
  appNavigate = vi.fn();
  (window as any).appNavigate = appNavigate;
  // Default to a neutral, non-typing focus.
  document.body.innerHTML = '';
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  setPath('/');
});

afterEach(() => {
  cleanupKeyboardShortcuts();
  delete (window as any).appNavigate;
  window.history.pushState({}, '', '/');
});

describe('prototype shell shortcuts (Shift + key)', () => {
  beforeEach(() => setPath('/prototype'));

  it('Shift+N → new note', () => {
    expectEvent('prototypeShortcutNewNote', () => press({ key: 'N', code: 'KeyN', shift: true }));
  });

  it('Shift+K → focus sidebar search', () => {
    expectEvent('prototypeShortcutFocusSidebarSearch', () => press({ key: 'K', code: 'KeyK', shift: true }));
  });

  it('Mod+K does not open production spotlight', () => {
    expectNoEvent('openSpotlightSearch', () => press({ key: 'k', code: 'KeyK', meta: true }));
  });

  it('Shift+, → settings', () => {
    press({ key: ',', code: 'Comma', shift: true });
    expect(appNavigate).toHaveBeenCalledWith('/prototype/settings');
  });

  it('Shift+S → toggle sidebar', () => {
    expectEvent('prototypeShortcutToggleSidebar', () => press({ key: 'S', code: 'KeyS', shift: true }));
  });

  it('Shift+H → show Home layer', () => {
    expectEvent('prototypeShortcutShowHome', () => press({ key: 'H', code: 'KeyH', shift: true }));
  });

  it('Shift+L → show list layer', () => {
    expectEvent('prototypeShortcutShowList', () => press({ key: 'L', code: 'KeyL', shift: true }));
  });

  it('Shift+J → focus note list', () => {
    expectEvent('prototypeShortcutFocusNoteList', () => press({ key: 'J', code: 'KeyJ', shift: true }));
  });

  it('Shift+ArrowLeft → cycle list mode backward', () => {
    const e = expectEvent('prototypeShortcutCycleListMode', () =>
      press({ key: 'ArrowLeft', code: 'ArrowLeft', shift: true }),
    );
    expect(e.detail).toEqual({ step: -1 });
  });

  it('Shift+ArrowRight → cycle list mode forward', () => {
    const e = expectEvent('prototypeShortcutCycleListMode', () =>
      press({ key: 'ArrowRight', code: 'ArrowRight', shift: true }),
    );
    expect(e.detail).toEqual({ step: 1 });
  });

  it('Shift+ArrowUp → move in list backward', () => {
    const e = expectEvent('prototypeShortcutMoveInList', () =>
      press({ key: 'ArrowUp', code: 'ArrowUp', shift: true }),
    );
    expect(e.detail).toEqual({ step: -1 });
  });

  it('Shift+ArrowDown → move in list forward', () => {
    const e = expectEvent('prototypeShortcutMoveInList', () =>
      press({ key: 'ArrowDown', code: 'ArrowDown', shift: true }),
    );
    expect(e.detail).toEqual({ step: 1 });
  });

  it('defers to typing context (does not fire in editor)', () => {
    const editor = document.createElement('div');
    editor.className = 'ProseMirror';
    const inner = document.createElement('div');
    editor.appendChild(inner);
    document.body.appendChild(editor);
    expectNoEvent('prototypeShortcutNewNote', () => {
      const event = new KeyboardEvent('keydown', { key: 'N', shiftKey: true, bubbles: true, cancelable: true });
      inner.dispatchEvent(event);
    });
  });

  it('Shift+H defers to typing context (does not fire in editor)', () => {
    const editor = document.createElement('div');
    editor.className = 'ProseMirror';
    const inner = document.createElement('div');
    editor.appendChild(inner);
    document.body.appendChild(editor);
    expectNoEvent('prototypeShortcutShowHome', () => {
      const event = new KeyboardEvent('keydown', {
        key: 'H',
        code: 'KeyH',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });
      inner.dispatchEvent(event);
    });
  });

  it('Shift+ArrowDown defers to typing context (does not fire in editor)', () => {
    const editor = document.createElement('div');
    editor.className = 'ProseMirror';
    const inner = document.createElement('div');
    editor.appendChild(inner);
    document.body.appendChild(editor);
    expectNoEvent('prototypeShortcutMoveInList', () => {
      const event = new KeyboardEvent('keydown', {
        key: 'ArrowDown',
        code: 'ArrowDown',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });
      inner.dispatchEvent(event);
    });
  });
});

describe('prototype note shortcuts (Shift + key, on a note route)', () => {
  beforeEach(() => setPath('/prototype/note_abc123'));

  it('Shift+F → find in note (carries noteId)', () => {
    const e = expectEvent('prototypeOpenFindInNote', () => press({ key: 'F', code: 'KeyF', shift: true }));
    expect(e.detail).toEqual({ noteId: 'note_abc123' });
  });

  it('Shift+D → toggle inspector', () => {
    expectEvent('prototypeShortcutToggleInspector', () => press({ key: 'D', code: 'KeyD', shift: true }));
  });

  it('Mod+S with panel open → save', () => {
    window.localStorage.setItem('showNewNotePanel', 'true');
    expectEvent('saveContent', () => press({ key: 's', code: 'KeyS', meta: true }));
  });

  it('Mod+ArrowLeft on a note route → home', () => {
    press({ key: 'ArrowLeft', code: 'ArrowLeft', meta: true });
    expect(appNavigate).toHaveBeenCalledWith('/prototype');
  });
});

describe('classic app shortcuts', () => {
  it('Mod+K → spotlight search', () => {
    setPath('/');
    expectEvent('openSpotlightSearch', () => press({ key: 'k', code: 'KeyK', meta: true }));
  });

  it('Mod+S with a panel open → save', () => {
    setPath('/');
    window.localStorage.setItem('showNewNotePanel', 'true');
    expectEvent('saveContent', () => press({ key: 's', code: 'KeyS', meta: true }));
  });

  it("Mod+' → new note panel", () => {
    setPath('/');
    expectEvent('openNewNotePanel', () => press({ key: "'", code: 'Quote', meta: true }));
  });

  it('Mod+; → new thread panel', () => {
    setPath('/');
    expectEvent('openNewThreadPanel', () => press({ key: ';', code: 'Semicolon', meta: true }));
  });

  it('Esc with a panel open → dismiss top layer', () => {
    setPath('/');
    window.localStorage.setItem('showNewNotePanel', 'true');
    expectEvent('closeNewNotePanel', () => press({ key: 'Escape', code: 'Escape' }));
  });

  it('Mod+Shift+H → home', () => {
    setPath('/note/note_abc');
    press({ key: 'h', code: 'KeyH', meta: true, shift: true });
    expect(appNavigate).toHaveBeenCalledWith('/');
  });

  it('Mod+Shift+D on a note → note details panel', () => {
    setPath('/note/note_abc');
    expectEvent('openNoteDetailsPanel', () => press({ key: 'd', code: 'KeyD', meta: true, shift: true }));
  });

  it('Mod+Shift+S on a note → share panel', () => {
    setPath('/note/note_abc');
    const e = expectEvent('openNoteSharePanel', () => press({ key: 's', code: 'KeyS', meta: true, shift: true }));
    expect(e.detail).toMatchObject({ contentType: 'note' });
  });

  it('Mod+Shift+L on a note → lock', () => {
    setPath('/note/note_abc');
    expectEvent('focusLockNote', () => press({ key: 'l', code: 'KeyL', meta: true, shift: true }));
  });

  it('Mod+Shift+E on a note → edit mode', () => {
    setPath('/note/note_abc');
    expectEvent('editNote', () => press({ key: 'e', code: 'KeyE', meta: true, shift: true }));
  });

  it('Mod+Delete → erase confirmation', () => {
    setPath('/note/note_abc');
    expectEvent('keyboardShortcutErase', () => press({ key: 'Delete', code: 'Delete', meta: true }));
  });

  it('Mod+ArrowLeft with no overlay/thread → back navigation', () => {
    setPath('/note/note_abc');
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    const event = press({ key: 'ArrowLeft', code: 'ArrowLeft', meta: true });
    // No hierarchy/overlay to resolve, so it falls back to a back action
    // (history.back when there is history, else navigate home). Either is a "go back".
    expect(event.defaultPrevented).toBe(true);
    expect(back.mock.calls.length > 0 || appNavigate.mock.calls.some((c) => c[0] === '/')).toBe(true);
    back.mockRestore();
  });

  it('Mod+Opt+S → opens desktop space switcher', () => {
    setPath('/');
    const details = document.createElement('details');
    details.className = 'space-switcher-details';
    document.body.appendChild(details);
    press({ key: 's', code: 'KeyS', meta: true, alt: true });
    expect(details.open).toBe(true);
  });
});

describe('browser-shadowing passthrough', () => {
  it('second identical Mod+K within the window passes through (no app event)', () => {
    setPath('/');
    // First press is intercepted by the app.
    expectEvent('openSpotlightSearch', () => press({ key: 'k', code: 'KeyK', meta: true }));
    // Immediate second press of the same chord should pass through to the browser.
    expectNoEvent('openSpotlightSearch', () => press({ key: 'k', code: 'KeyK', meta: true }));
  });
});
