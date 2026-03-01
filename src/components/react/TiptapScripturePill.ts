import { Mark } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection } from 'prosemirror-state';
import { safeNavigate } from '@/utils/safe-navigate';
import { idToUrl, extractIdFromPath } from '@/utils/url-helpers';

/**
 * Helper function to detect the current thread context from the page
 * Checks multiple sources: note element, navigation element, and URL pathname
 */
function getCurrentThreadContext(): string | null {
  if (typeof window === 'undefined') return null;
  
  const noteElement = document.querySelector('[data-note-id]') as HTMLElement;
  if (noteElement?.dataset.parentThreadId) {
    return noteElement.dataset.parentThreadId;
  }
  
  const navigationElement = document.querySelector('[slot="navigation"]') as HTMLElement;
  if (navigationElement?.dataset.parentThreadId) {
    return navigationElement.dataset.parentThreadId;
  }
  
  const pathname = window.location.pathname;
  if (pathname && pathname !== '/' && !pathname.includes('/dashboard') &&
      !pathname.includes('/sign-in') && !pathname.includes('/sign-up')) {
    const itemId = extractIdFromPath(pathname);
    if (itemId && itemId !== 'dashboard' &&
        !itemId.startsWith('note_') && !itemId.startsWith('space_')) {
      return itemId;
    }
  }
  
  return null;
}

export interface ScripturePillOptions {
  HTMLAttributes: Record<string, any>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    scripturePill: {
      /**
       * Set a scripture pill mark
       */
      setScripturePill: (attributes: { reference: string; noteId: string | null }) => ReturnType;
      /**
       * Toggle a scripture pill mark
       */
      toggleScripturePill: (attributes: { reference: string; noteId: string | null }) => ReturnType;
      /**
       * Unset a scripture pill mark
       */
      unsetScripturePill: () => ReturnType;
    };
  }
}

export const ScripturePill = Mark.create<ScripturePillOptions>({
  name: 'scripturePill',

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      reference: {
        default: null,
        parseHTML: element => element.getAttribute('data-scripture-reference'),
        renderHTML: attributes => {
          if (!attributes.reference) {
            return {};
          }
          return {
            'data-scripture-reference': attributes.reference,
          };
        },
      },
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

  // CRITICAL: Set inclusive to false to prevent mark "stickiness" at boundaries
  inclusive: false,
  
  // Nuclear option: exclude ALL other marks to prevent any "stickiness"
  // or inheritance when typing after a pill
  excludes: '_',

  parseHTML() {
    return [
      {
        tag: 'span[data-scripture-reference]',
        getAttrs: element => {
          const reference = (element as HTMLElement).getAttribute('data-scripture-reference');
          const noteId = (element as HTMLElement).getAttribute('data-note-id');
          if (!reference) {
            return false;
          }
          return { reference, noteId: noteId || null };
        },
      },
      {
        tag: 'span.note-link[data-scripture-reference]',
        getAttrs: (element) => {
          const noteId = (element as HTMLElement).getAttribute('data-note-id');
          const reference = (element as HTMLElement).getAttribute('data-scripture-reference');
          if (!reference) {
            return false;
          }
          return { reference, noteId: noteId || null };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const noteId = HTMLAttributes['data-note-id'] || null;
    const reference = HTMLAttributes['data-scripture-reference'] || null;

    if (!reference) {
      return ['span', {}, 0];
    }

    // Always use cursor: pointer to indicate interactivity, even for pending pills
    // No min-height — let the pill's height be determined by the same line-height as
    // surrounding text so lines with pills don't have different spacing.
    const baseStyle = 'background-color: var(--color-paper); border-radius: 12px; padding: 2px 8px; display: inline-flex; align-items: baseline; gap: 4px; box-shadow: 0px -3px 0px 0px inset rgba(176,176,176,0.25); font-weight: 600; font-style: normal; font-size: 16px; color: var(--color-deep-grey); vertical-align: baseline; line-height: 1.6; user-select: none; white-space: normal; cursor: pointer;';

    return [
      'span',
      {
        ...this.options.HTMLAttributes,
        ...HTMLAttributes,
        class: 'scripture-pill scripture-pill-clickable',
        style: baseStyle,
      },
      0,
    ];
  },

  addCommands() {
    return {
      setScripturePill: attributes => ({ commands }) => {
        return commands.setMark(this.name, attributes);
      },
      toggleScripturePill: attributes => ({ commands }) => {
        return commands.toggleMark(this.name, attributes);
      },
      unsetScripturePill: () => ({ commands }) => {
        return commands.unsetMark(this.name);
      },
    };
  },

  addKeyboardShortcuts() {
    // Helper function to find pill boundaries
    const findPillBoundaries = (doc: any, pos: number): { start: number; end: number } | null => {
      let pillStart = pos;
      let pillEnd = pos;

      const $pos = doc.resolve(pos);
      const marks = $pos.marks();
      const scripturePillMark = marks.find((m: any) => m.type.name === 'scripturePill');

      if (!scripturePillMark) return null;

      // Scan backwards
      while (pillStart > 0) {
        const $p = doc.resolve(pillStart - 1);
        if (!$p.marks().some((m: any) => m.type.name === 'scripturePill' && m.attrs.reference === scripturePillMark.attrs.reference)) {
          break;
        }
        pillStart--;
      }

      // Scan forwards
      while (pillEnd < doc.content.size) {
        const $p = doc.resolve(pillEnd + 1);
        if (!$p.marks().some((m: any) => m.type.name === 'scripturePill' && m.attrs.reference === scripturePillMark.attrs.reference)) {
          break;
        }
        pillEnd++;
      }

      return { start: pillStart, end: pillEnd };
    };

    const removePillWhenInside = ({ editor }: { editor: any }) => {
      const { state } = editor;
      const { selection } = state;
      const { $from, from, to } = selection;

      const scripturePillMark = $from.marks().find((mark: any) => mark.type.name === 'scripturePill');

      if (scripturePillMark && from === to) {
        const boundaries = findPillBoundaries(state.doc, from);
        if (boundaries) {
          editor.chain().setTextSelection({ from: boundaries.start, to: boundaries.end }).unsetMark('scripturePill').run();
          return true;
        }
      }
      return false;
    };

    return {
      'Backspace': removePillWhenInside,
      'Delete': removePillWhenInside,
    };
  },

  addProseMirrorPlugins() {
    return [
      // Safety net: strip scripturePill from stored marks when cursor is after a pill
      // This prevents the mark from "sticking" to newly typed text
      new Plugin({
        key: new PluginKey('scripturePillStoredMarks'),
        appendTransaction(transactions, oldState, newState) {
          const { selection, storedMarks } = newState;
          if (!storedMarks) return null;

          const hasPillMark = storedMarks.some(m => m.type.name === 'scripturePill');
          if (!hasPillMark) return null;

          // Cursor is about to type with pill mark — check if we're actually inside a pill
          const $from = selection.$from;
          const marksAtCursor = $from.marks();
          const insidePill = marksAtCursor.some(m => m.type.name === 'scripturePill');

          // If cursor is NOT inside a pill, the stored marks shouldn't include pill
          if (!insidePill) {
            const cleaned = storedMarks.filter(m => m.type.name !== 'scripturePill');
            return newState.tr.setStoredMarks(cleaned);
          }

          return null;
        },
      }),
      new Plugin({
        key: new PluginKey('scripturePillActions'),
        props: {
          handleClick: (view, pos, event) => {
            const { state } = view;
            const $pos = state.doc.resolve(pos);
            const marks = $pos.marks();
            const scripturePillMark = marks.find(mark => mark.type.name === 'scripturePill');

            if (!scripturePillMark) return false;

            const noteId = scripturePillMark.attrs.noteId;

            // Don't navigate if pill is pending
            if (noteId === 'pending' || !noteId) {
              return true; 
            }

            const url = idToUrl(`note_${noteId}`, getCurrentThreadContext() || undefined);
            safeNavigate(url);
            return true;
          },
        },
      }),
    ];
  },
});