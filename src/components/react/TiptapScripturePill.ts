import { Mark, getMarkRange } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import { getTranslationAbbreviationDisplay } from '@/data/translations';
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
      setScripturePill: (attributes: { reference: string; noteId: string | null; translation?: string | null }) => ReturnType;
      /**
       * Toggle a scripture pill mark
       */
      toggleScripturePill: (attributes: { reference: string; noteId: string | null; translation?: string | null }) => ReturnType;
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
      translation: {
        default: null,
        parseHTML: element => element.getAttribute('data-scripture-translation'),
        renderHTML: attributes => {
          if (!attributes.translation) {
            return {};
          }
          const id = attributes.translation as string;
          return {
            'data-scripture-translation': id,
            'data-scripture-translation-label': getTranslationAbbreviationDisplay(id),
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
          const translation = (element as HTMLElement).getAttribute('data-scripture-translation');
          return { reference, noteId: noteId || null, translation: translation || null };
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
          const translation = (element as HTMLElement).getAttribute('data-scripture-translation');
          return { reference, noteId: noteId || null, translation: translation || null };
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
    const baseStyle = 'background-color: var(--color-paper); border-radius: 12px; padding: 2px 8px; display: inline-flex; align-items: baseline; gap: 4px; box-shadow: 0px -3px 0px 0px inset rgba(176,176,176,0.25); font-weight: 600; font-style: normal; font-size: 16px; color: var(--color-deep-grey); vertical-align: baseline; line-height: 1.6; user-select: all; white-space: normal; cursor: pointer;';

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
      // After every update, if the collapsed cursor landed inside a scripture pill (common with
      // inclusive:false + last-in-block), move it to the position after the mark. Uses
      // @tiptap/core getMarkRange — same helper as snapCursorOutsideScripturePill in TiptapEditor.
      new Plugin({
        key: new PluginKey('scripturePillSnapCursor'),
        appendTransaction(_transactions, _oldState, newState) {
          const sel = newState.selection;
          if (!(sel instanceof TextSelection)) return null;
          const markType = newState.schema.marks.scripturePill;
          if (!markType) return null;

          const $from = sel.$from;
          const parent = $from.parent;
          const offset = $from.parentOffset;

          const after = parent.childAfter(offset);
          const afterInPill = after.node?.marks.some((m: any) => m.type === markType) ?? false;
          const before = parent.childBefore(offset);
          const beforeInPill = before.node?.marks.some((m: any) => m.type === markType) ?? false;

          if (!afterInPill && !beforeInPill) return null;
          // Cursor right after pill with nothing following — visually inside the pill box.
          // Can't fix here (inserting a paragraph would mark the note as changed); handled
          // by CardFullEditable.handleEditorReady and snapCursorOutsideScripturePill instead.
          if (beforeInPill && !afterInPill && sel.empty) return null;

          // Cursor truly inside pill text — snap to end of mark range
          const range = getMarkRange($from, markType) || (beforeInPill ? getMarkRange(newState.doc.resolve(Math.max(0, sel.from - 1)), markType) : null);
          if (!range) return null;
          if (sel.empty && sel.from === range.to) return null;
          return newState.tr
            .setSelection(TextSelection.create(newState.doc, range.to))
            .setStoredMarks([])
            .setMeta('addToHistory', false);
        },
      }),
      new Plugin({
        key: new PluginKey('scripturePillActions'),
        props: {
          handleClick: (_view, _pos, event) => {
            // ALL pill clicks (edit and read-only) are handled by a DOM-level
            // click handler in TiptapEditor. user-select:none on pill spans causes
            // ProseMirror to report positions outside the mark boundary, so we
            // bypass ProseMirror's handleClick entirely for pill clicks.
            const target = event.target as HTMLElement;
            if (target?.closest?.('.scripture-pill')) {
              return false; // Let the DOM handler in TiptapEditor handle it
            }
            return false;
          },
        },
      }),
    ];
  },
});