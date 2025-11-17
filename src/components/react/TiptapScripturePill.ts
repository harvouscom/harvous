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
      {
        // Also handle note-link spans that have data-scripture-reference
        // This helps when HTML contains note-link spans that should be scripture pills
        tag: 'span.note-link[data-scripture-reference]',
        getAttrs: (element) => {
          const noteId = (element as HTMLElement).getAttribute('data-note-id');
          const reference = (element as HTMLElement).getAttribute('data-scripture-reference');
          // Only parse if it has a scripture reference attribute
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
    // Helper function to find pill boundaries
    const findPillBoundaries = (doc: any, pos: number): { start: number; end: number } | null => {
      let pillStart = pos;
      let pillEnd = pos;
      
      // Find start of pill
      for (let p = pos; p >= 0; p--) {
        try {
          const $p = doc.resolve(p);
          const marks = $p.marks();
          const hasPill = marks.some(m => m.type.name === 'scripturePill');
          if (!hasPill) {
            pillStart = p + 1;
            break;
          }
          if (p === 0) {
            pillStart = 0;
            break;
          }
        } catch (e) {
          pillStart = p + 1;
          break;
        }
      }
      
      // Find end of pill
      for (let p = pos; p <= doc.content.size; p++) {
        try {
          const $p = doc.resolve(p);
          const marks = $p.marks();
          const hasPill = marks.some(m => m.type.name === 'scripturePill');
          if (!hasPill) {
            pillEnd = p;
            break;
          }
        } catch (e) {
          pillEnd = p;
          break;
        }
      }
      
      return { start: pillStart, end: pillEnd };
    };
    
    // Helper function to check if entire pill is selected
    const isEntirePillSelected = (doc: any, from: number, to: number): boolean => {
      const boundaries = findPillBoundaries(doc, from);
      if (!boundaries) return false;
      return from === boundaries.start && to === boundaries.end;
    };
    
    return {
      Tab: ({ editor }) => {
        const { state } = editor;
        const { selection } = state;
        const { $from, from, to } = selection;
        
        // Check if cursor is inside a scripture pill
        const scripturePillMark = $from.marks().find(mark => mark.type.name === 'scripturePill');
        
        if (scripturePillMark && from === to) {
          // Find the end of the mark
          const boundaries = findPillBoundaries(state.doc, from);
          if (boundaries) {
            // Move cursor to end of pill and unset marks
            editor.chain()
              .setTextSelection(boundaries.end)
              .unsetAllMarks()
              .run();
            return true;
          }
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
          const boundaries = findPillBoundaries(state.doc, from);
          if (boundaries) {
            // Insert space after pill and move cursor
            editor.chain()
              .setTextSelection(boundaries.end)
              .insertContent(' ')
              .setTextSelection(boundaries.end + 1)
              .unsetAllMarks()
              .run();
            return true;
          }
        }
        
        return false;
      },
      // Prevent text input when cursor is inside a pill (unless entire pill is selected for deletion)
      'Backspace': ({ editor }) => {
        const { state } = editor;
        const { selection } = state;
        const { $from, from, to } = selection;
        
        const scripturePillMark = $from.marks().find(mark => mark.type.name === 'scripturePill');
        
        if (scripturePillMark) {
          // Allow deletion only if entire pill is selected
          if (isEntirePillSelected(state.doc, from, to)) {
            // Allow normal deletion
            return false;
          } else {
            // Prevent partial deletion - move cursor to end of pill
            const boundaries = findPillBoundaries(state.doc, from);
            if (boundaries) {
              editor.chain()
                .setTextSelection(boundaries.end)
                .unsetAllMarks()
                .run();
              return true;
            }
          }
        }
        
        return false;
      },
      'Delete': ({ editor }) => {
        const { state } = editor;
        const { selection } = state;
        const { $from, from, to } = selection;
        
        const scripturePillMark = $from.marks().find(mark => mark.type.name === 'scripturePill');
        
        if (scripturePillMark) {
          // Allow deletion only if entire pill is selected
          if (isEntirePillSelected(state.doc, from, to)) {
            // Allow normal deletion
            return false;
          } else {
            // Prevent partial deletion - move cursor to end of pill
            const boundaries = findPillBoundaries(state.doc, from);
            if (boundaries) {
              editor.chain()
                .setTextSelection(boundaries.end)
                .unsetAllMarks()
                .run();
              return true;
            }
          }
        }
        
        return false;
      },
      // Prevent all other text input (letters, numbers, punctuation) when inside a pill
      // This is a catch-all for any character input
      '*': ({ editor, view, event }) => {
        const { state } = editor;
        const { selection } = state;
        const { $from, from, to } = selection;
        
        const scripturePillMark = $from.marks().find(mark => mark.type.name === 'scripturePill');
        
        if (scripturePillMark && from === to) {
          // Check if this is a printable character (not a control key)
          const key = (event as KeyboardEvent).key;
          // Allow arrow keys, Tab, Enter, Escape, etc. (control keys)
          const isControlKey = key.length > 1 || 
            ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter', 'Escape', 'Home', 'End', 'PageUp', 'PageDown'].includes(key);
          
          if (!isControlKey) {
            // This is a printable character - prevent input and move cursor to end of pill
            const boundaries = findPillBoundaries(state.doc, from);
            if (boundaries) {
              editor.chain()
                .setTextSelection(boundaries.end)
                .unsetAllMarks()
                .run();
              return true;
            }
          }
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

