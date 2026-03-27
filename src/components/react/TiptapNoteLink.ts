import { Mark } from '@tiptap/core';
import type { EditorView } from '@tiptap/pm/view';
import type { Mark as PMMark } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { safeNavigate } from '@/utils/safe-navigate';
import { idToUrl, extractIdFromPath } from '@/utils/url-helpers';
import { pushNavStack } from '@/utils/nav-stack';

/**
 * Helper to detect the current thread context from the page DOM.
 * Checks note element, navigation element, and URL pathname.
 */
function getThreadContext(): string | undefined {
  if (typeof window === 'undefined') return undefined;

  try {
    const fromQuery = new URLSearchParams(window.location.search).get('thread');
    if (fromQuery && fromQuery.startsWith('thread_')) return fromQuery;
  } catch {
    // ignore
  }

  const currentNoteId = extractIdFromPath(window.location.pathname);
  if (currentNoteId?.startsWith('note_')) {
    try {
      const cached = localStorage.getItem(`harvous-note-thread-${currentNoteId}`);
      if (cached && cached.startsWith('thread_')) return cached;
    } catch {
      // ignore
    }
  }

  const noteEl = document.querySelector('[data-note-id]') as HTMLElement | null;
  if (noteEl?.dataset.parentThreadId) return noteEl.dataset.parentThreadId;

  const navEl = document.querySelector('[slot="navigation"]') as HTMLElement | null;
  if (navEl?.dataset.parentThreadId) return navEl.dataset.parentThreadId;

  const itemId = extractIdFromPath(window.location.pathname);
  if (itemId && itemId.startsWith('thread_')) return itemId;

  return undefined;
}

export interface NoteLinkOptions {
  HTMLAttributes: Record<string, any>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    noteLink: {
      /**
       * Set a note link mark
       */
      setNoteLink: (attributes: { noteId: string }) => ReturnType;
      /**
       * Toggle a note link mark
       */
      toggleNoteLink: (attributes: { noteId: string }) => ReturnType;
      /**
       * Unset a note link mark
       */
      unsetNoteLink: () => ReturnType;
    };
  }
}

export const NoteLink = Mark.create<NoteLinkOptions>({
  name: 'noteLink',

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      noteId: {
        default: null,
        parseHTML: element => element.getAttribute('data-note-id'),
        renderHTML: attributes => {
          if (!attributes.noteId) {
            return {};
          }
          return {
            'data-note-id': attributes.noteId,
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        // Only match spans with data-note-id that do NOT have data-scripture-reference
        // This prevents NoteLink from capturing scripture pills (which have both attributes)
        tag: 'span[data-note-id]:not([data-scripture-reference])',
        getAttrs: element => {
          const noteId = (element as HTMLElement).getAttribute('data-note-id');
          return noteId ? { noteId } : false;
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      {
        ...this.options.HTMLAttributes,
        ...HTMLAttributes,
        class: 'note-link',
        style: 'background-color: rgba(255, 235, 59, 0.4); cursor: pointer;',
      },
      0,
    ];
  },

  addCommands() {
    return {
      setNoteLink:
        attributes =>
        ({ chain }) => {
          return chain().setMark(this.name, attributes).run();
        },
      toggleNoteLink:
        attributes =>
        ({ chain }) => {
          return chain().toggleMark(this.name, attributes).run();
        },
      unsetNoteLink:
        () =>
        ({ chain }) => {
          return chain().unsetMark(this.name).run();
        },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('noteLinkClick'),
        props: {
          handleClick(view: EditorView, _pos: number, event: MouseEvent) {
            const { state } = view;
            const { selection } = state;
            const { $from } = selection;

            // Check if click is on a note link
            const noteId = $from.marks().find((mark: PMMark) => mark.type.name === 'noteLink')?.attrs.noteId;

            if (noteId) {
              event.preventDefault();
              // Navigate to note using Astro view transitions
              const currentNoteId = extractIdFromPath(window.location.pathname);
              const threadCtx = getThreadContext();
              if (currentNoteId?.startsWith('note_') && threadCtx) {
                pushNavStack(currentNoteId, threadCtx);
              }
              if (threadCtx && threadCtx !== 'thread_unorganized') {
                const targetId = noteId.startsWith('note_') ? noteId : `note_${noteId}`;
                fetch(`/api/notes/${targetId}/add-thread`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ threadId: threadCtx }),
                  credentials: 'include',
                })
                  .then((res) => {
                    if (res.ok) {
                      window.dispatchEvent(
                        new CustomEvent('noteAddedToThread', {
                          detail: { noteId: targetId, threadId: threadCtx, source: 'inlineAddThread' },
                        })
                      );
                    }
                  })
                  .catch(() => {});
              }
              safeNavigate(idToUrl(noteId, threadCtx, currentNoteId || undefined), { history: 'push' });
              return true;
            }

            // Also check if clicking on the span element directly
            const target = event.target as HTMLElement;
            if (target.classList.contains('note-link')) {
              const clickedNoteId = target.getAttribute('data-note-id');
              if (clickedNoteId) {
                event.preventDefault();
                const currentNoteId = extractIdFromPath(window.location.pathname);
                const threadCtx = getThreadContext();
                if (currentNoteId?.startsWith('note_') && threadCtx) {
                  pushNavStack(currentNoteId, threadCtx);
                }
                if (threadCtx && threadCtx !== 'thread_unorganized') {
                  const targetId = clickedNoteId.startsWith('note_') ? clickedNoteId : `note_${clickedNoteId}`;
                  fetch(`/api/notes/${targetId}/add-thread`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ threadId: threadCtx }),
                    credentials: 'include',
                  })
                    .then((res) => {
                      if (res.ok) {
                        window.dispatchEvent(
                          new CustomEvent('noteAddedToThread', {
                            detail: { noteId: targetId, threadId: threadCtx, source: 'inlineAddThread' },
                          })
                        );
                      }
                    })
                    .catch(() => {});
                }
                safeNavigate(idToUrl(clickedNoteId, threadCtx, currentNoteId || undefined), { history: 'push' });
                return true;
              }
            }

            return false;
          },
        },
      }),
    ];
  },
});

