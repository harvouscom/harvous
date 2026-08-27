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

// jsdom's default test hostname is `localhost`, one of `DEDICATED_PROTOTYPE_HOSTS`
// (see `src/lib/prototype-path.ts`), so real dedicated-host behavior is exercised by
// default below. The "classic app shortcuts" / browser-shadowing-passthrough suites
// intentionally exercise the legacy non-dedicated-host code path (pre-`/prototype`-shell
// behavior, still live for non-dedicated deploys); `mockClassicHost` flips that on for
// just those tests. (Variable must be prefixed `mock*` — Vitest only hoists references
// with that prefix into `vi.mock` factories.)
let mockClassicHost = false;
vi.mock('@/lib/prototype-path', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/prototype-path')>();
  return {
    ...actual,
    isPrototypeShellPath: (pathname: string) =>
      mockClassicHost ? pathname.startsWith('/prototype') : actual.isPrototypeShellPath(pathname),
    prototypeHomePath: () => (mockClassicHost ? '/prototype' : actual.prototypeHomePath()),
    prototypeSettingsRouteTo: () =>
      mockClassicHost ? '/prototype/settings' : actual.prototypeSettingsRouteTo(),
  };
});

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

  it('Shift+K → open the command palette', () => {
    expectEvent('prototypeShortcutOpenCommandPalette', () =>
      press({ key: 'K', code: 'KeyK', shift: true }),
    );
  });

  /* The behaviour Shift+K used to have is not lost — Mod+F still has it. */
  it('Shift+K no longer focuses the sidebar search', () => {
    expectNoEvent('prototypeShortcutFocusSidebarSearch', () =>
      press({ key: 'K', code: 'KeyK', shift: true }),
    );
  });

  it('Mod+F still focuses the sidebar search', () => {
    expectEvent('prototypeShortcutFocusSidebarSearch', () =>
      press({ key: 'f', code: 'KeyF', meta: true }),
    );
  });

  it('Mod+K does not open production spotlight', () => {
    expectNoEvent('openSpotlightSearch', () => press({ key: 'k', code: 'KeyK', meta: true }));
  });

  it('Shift+, → settings', () => {
    // On a dedicated prototype host (jsdom's default test hostname is `localhost`), settings
    // always live at the bare `/settings` route, regardless of the current path.
    press({ key: ',', code: 'Comma', shift: true });
    expect(appNavigate).toHaveBeenCalledWith('/settings');
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

  it('Shift+R → open the reader', () => {
    expectEvent('prototypeShortcutOpenReader', () => press({ key: 'R', code: 'KeyR', shift: true }));
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

  describe('organize verbs', () => {
    /*
     * One event carries all of them — the sidebar is what knows whether a selection
     * stands, which row has focus, and whether the verb may act on either. Here we only
     * check the naming.
     */
    it.each([
      ['X', 'KeyX', 'select'],
      ['A', 'KeyA', 'selectAll'],
      ['M', 'KeyM', 'folder'],
      ['T', 'KeyT', 'thread'],
      ['P', 'KeyP', 'pin'],
    ])('Shift+%s → %s', (key, code, verb) => {
      const e = expectEvent('prototypeShortcutListVerb', () => press({ key, code, shift: true }));
      expect(e.detail).toEqual({ verb });
    });

    it('Shift+Backspace → delete', () => {
      const e = expectEvent('prototypeShortcutListVerb', () =>
        press({ key: 'Backspace', code: 'Backspace', shift: true }),
      );
      expect(e.detail).toEqual({ verb: 'delete' });
    });

    it('leaves Shift+F to Find-in-note rather than claiming it for folder', () => {
      expectNoEvent('prototypeShortcutListVerb', () => press({ key: 'F', code: 'KeyF', shift: true }));
    });

    it('does not fire while typing', () => {
      const editor = document.createElement('div');
      editor.className = 'ProseMirror';
      const inner = document.createElement('div');
      editor.appendChild(inner);
      document.body.appendChild(editor);
      expectNoEvent('prototypeShortcutListVerb', () => {
        const event = new KeyboardEvent('keydown', {
          key: 'M',
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        });
        inner.dispatchEvent(event);
      });
      editor.remove();
    });
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
    // Dedicated-host home is the bare root, not `/prototype`.
    press({ key: 'ArrowLeft', code: 'ArrowLeft', meta: true });
    expect(appNavigate).toHaveBeenCalledWith('/');
  });
});

describe('classic app shortcuts', () => {
  beforeEach(() => {
    mockClassicHost = true;
  });
  afterEach(() => {
    mockClassicHost = false;
  });

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
  beforeEach(() => {
    mockClassicHost = true;
  });
  afterEach(() => {
    mockClassicHost = false;
  });

  it('second identical Mod+K within the window passes through (no app event)', () => {
    setPath('/');
    // First press is intercepted by the app.
    expectEvent('openSpotlightSearch', () => press({ key: 'k', code: 'KeyK', meta: true }));
    // Immediate second press of the same chord should pass through to the browser.
    expectNoEvent('openSpotlightSearch', () => press({ key: 'k', code: 'KeyK', meta: true }));
  });
});
