import { Mark } from '@tiptap/core';

export interface ScripturePillOptions {
  HTMLAttributes: Record<string, any>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    scripturePill: {
      /**
       * Set a scripture pill mark
       */
      setScripturePill: (attributes: { reference: string; noteId?: string }) => ReturnType;
      /**
       * Toggle a scripture pill mark
       */
      toggleScripturePill: (attributes: { reference: string; noteId?: string }) => ReturnType;
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

  parseHTML() {
    return [
      {
        tag: 'span[data-scripture-reference]',
        getAttrs: element => {
          const reference = (element as HTMLElement).getAttribute('data-scripture-reference');
          const noteId = (element as HTMLElement).getAttribute('data-note-id');
          return reference ? { reference, noteId } : false;
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const noteId = HTMLAttributes['data-note-id'] || null;

    return [
      'span',
      {
        ...this.options.HTMLAttributes,
        ...HTMLAttributes,
        class: `scripture-pill ${noteId ? 'scripture-pill-clickable' : ''}`,
        style: `
          background-color: var(--color-paper);
          border-radius: 4px;
          padding: 0px 8px 0px 6px;
          display: inline-flex;
          align-items: baseline;
          height: auto;
          min-height: 28px;
          gap: 6px;
          box-shadow: 0px -3px 0px 0px inset rgba(176,176,176,0.25);
          font-weight: 600;
          font-size: 16px;
          color: var(--color-deep-grey);
          vertical-align: baseline;
          line-height: 1.6;
          user-select: none;
          ${noteId ? 'cursor: pointer;' : ''}
        `,
      },
      0,
    ];
  },

  addCommands() {
    return {
      setScripturePill:
        attributes =>
        ({ chain }) => {
          return chain().setMark(this.name, attributes).run();
        },
      toggleScripturePill:
        attributes =>
        ({ chain }) => {
          return chain().toggleMark(this.name, attributes).run();
        },
      unsetScripturePill:
        () =>
        ({ chain }) => {
          return chain().unsetMark(this.name).run();
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      Tab: ({ editor }) => {
        const { state } = editor;
        const { selection } = state;
        const { $from, from, to } = selection;
        
        // Check if cursor is inside a scripture pill
        const scripturePillMark = $from.marks().find(mark => mark.type.name === 'scripturePill');
        
        if (scripturePillMark && from === to) {
          // Find the end of the mark
          const doc = state.doc;
          let pillEnd = from;
          
          // Find where the mark ends
          for (let pos = from; pos <= doc.content.size; pos++) {
            try {
              const $pos = doc.resolve(pos);
              const marks = $pos.marks();
              const hasPill = marks.some(m => m.type.name === 'scripturePill');
              if (!hasPill) {
                pillEnd = pos;
                break;
              }
            } catch (e) {
              pillEnd = pos;
              break;
            }
          }
          
          // Move cursor to end of pill and unset marks
          editor.chain()
            .setTextSelection(pillEnd)
            .unsetAllMarks()
            .run();
          return true;
        }
        
        return false;
      },
      'Space': ({ editor }) => {
        const { state } = editor;
        const { selection } = state;
        const { $from, from, to } = selection;
        
        // Check if cursor is inside a scripture pill
        const scripturePillMark = $from.marks().find(mark => mark.type.name === 'scripturePill');
        
        if (scripturePillMark && from === to) {
          // Find the end of the mark
          const doc = state.doc;
          let pillEnd = from;
          
          // Find where the mark ends
          for (let pos = from; pos <= doc.content.size; pos++) {
            try {
              const $pos = doc.resolve(pos);
              const marks = $pos.marks();
              const hasPill = marks.some(m => m.type.name === 'scripturePill');
              if (!hasPill) {
                pillEnd = pos;
                break;
              }
            } catch (e) {
              pillEnd = pos;
              break;
            }
          }
          
          // Insert space after pill and move cursor
          editor.chain()
            .setTextSelection(pillEnd)
            .insertContent(' ')
            .setTextSelection(pillEnd + 1)
            .unsetAllMarks()
            .run();
          return true;
        }
        
        return false;
      },
    };
  },

  addEventListeners() {
    return {
      click: (view, event) => {
        const { state } = view;
        const { selection } = state;
        const { $from } = selection;

        // Check if click is on a scripture pill
        const scripturePillMark = $from.marks().find(mark => mark.type.name === 'scripturePill');
        const noteId = scripturePillMark?.attrs.noteId;
        
        if (noteId) {
          event.preventDefault();
          // Navigate to note using Astro view transitions
          window.location.href = `/${noteId}`;
          return true;
        }

        // Also check if clicking on the span element directly
        const target = event.target as HTMLElement;
        const pillElement = target.closest('.scripture-pill');
        if (pillElement) {
          const clickedNoteId = pillElement.getAttribute('data-note-id');
          if (clickedNoteId) {
            event.preventDefault();
            window.location.href = `/${clickedNoteId}`;
            return true;
          }
        }

        return false;
      },
    };
  },
});

