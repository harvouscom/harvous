import { Mark } from '@tiptap/core';
import { safeNavigate } from '@/utils/safe-navigate';

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

  addEventListeners() {
    return {
      click: (view, event) => {
        const { state } = view;
        const { selection } = state;
        const { $from } = selection;

        // Check if click is on a note link
        const noteId = $from.marks().find(mark => mark.type.name === 'noteLink')?.attrs.noteId;
        
        if (noteId) {
          event.preventDefault();
          // Navigate to note using Astro view transitions
          safeNavigate(`/${noteId}`, { history: 'push' });
          return true;
        }

        // Also check if clicking on the span element directly
        const target = event.target as HTMLElement;
        if (target.classList.contains('note-link')) {
          const clickedNoteId = target.getAttribute('data-note-id');
          if (clickedNoteId) {
            event.preventDefault();
            safeNavigate(`/${clickedNoteId}`, { history: 'push' });
            return true;
          }
        }

        return false;
      },
    };
  },
});

