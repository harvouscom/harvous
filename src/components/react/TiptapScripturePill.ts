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
      click: async (view, event) => {
        const { state } = view;
        const { selection } = state;
        const { $from } = selection;

        // Check if click is on a scripture pill
        const scripturePillMark = $from.marks().find(mark => mark.type.name === 'scripturePill');
        const noteId = scripturePillMark?.attrs.noteId;
        const reference = scripturePillMark?.attrs.reference;
        
        if (noteId) {
          event.preventDefault();
          
          // Check if note exists, and recreate if needed
          let targetNoteId = noteId;
          
          try {
            const checkResponse = await fetch(`/api/notes/${noteId}/details`, {
              method: 'GET',
              credentials: 'include'
            });
            
            // If note doesn't exist and we have a reference, recreate it
            if (!checkResponse.ok && reference) {
              const normalizedRef = reference; // Reference should already be normalized
              
              // Fetch verse text first
              let verseText = reference;
              try {
                const verseResponse = await fetch('/api/scripture/fetch-verse', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ reference: normalizedRef }),
                  credentials: 'include'
                });

                if (verseResponse.ok) {
                  const verseData = await verseResponse.json();
                  verseText = verseData.text || reference;
                }
              } catch (error) {
                console.error('Error fetching verse text:', error);
              }

              // Create new note with verse text as content
              const formData = new FormData();
              formData.set('content', verseText);
              formData.set('title', reference);
              formData.set('threadId', 'thread_unorganized');
              formData.set('noteType', 'scripture');
              formData.set('scriptureReference', normalizedRef);
              formData.set('scriptureVersion', 'NET');

              const createResponse = await fetch('/api/notes/create', {
                method: 'POST',
                body: formData,
                credentials: 'include'
              });

              if (createResponse.ok) {
                const result = await createResponse.json();
                if (result.note && result.note.id) {
                  targetNoteId = result.note.id;
                  
                  // Update the pill's noteId attribute in the editor
                  try {
                    const { from, to } = state.selection;
                    const tr = state.tr;
                    
                    // Find the range of the scripture pill mark
                    let pillStart = from;
                    let pillEnd = from;
                    
                    // Find start of pill
                    for (let pos = from; pos >= 0; pos--) {
                      try {
                        const $pos = state.doc.resolve(pos);
                        const marks = $pos.marks();
                        const hasPill = marks.some(m => m.type.name === 'scripturePill');
                        if (!hasPill) {
                          pillStart = pos + 1;
                          break;
                        }
                        if (pos === 0) {
                          pillStart = 0;
                          break;
                        }
                      } catch (e) {
                        pillStart = pos + 1;
                        break;
                      }
                    }
                    
                    // Find end of pill
                    for (let pos = from; pos <= state.doc.content.size; pos++) {
                      try {
                        const $pos = state.doc.resolve(pos);
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
                    
                    // Update the mark with new noteId
                    const markType = state.schema.marks.scripturePill;
                    if (markType) {
                      tr.removeMark(pillStart, pillEnd, markType);
                      tr.addMark(pillStart, pillEnd, markType.create({
                        reference: reference,
                        noteId: targetNoteId
                      }));
                      view.dispatch(tr);
                    }
                  } catch (updateError) {
                    console.error('Error updating pill noteId:', updateError);
                    // Continue with navigation even if update fails
                  }
                  
                  // Show success toast
                  if (window.toast) {
                    window.toast.success(`Scripture note restored: ${reference}`);
                  }
                }
              }
            }
          } catch (error) {
            console.error('Error checking/restoring note:', error);
          }
          
          // Navigate to note (either original or recreated)
          window.location.href = `/${targetNoteId}`;
          return true;
        }

        // Also check if clicking on the span element directly
        const target = event.target as HTMLElement;
        const pillElement = target.closest('.scripture-pill');
        if (pillElement) {
          const clickedNoteId = pillElement.getAttribute('data-note-id');
          const clickedReference = pillElement.getAttribute('data-scripture-reference');
          
          if (clickedNoteId) {
            event.preventDefault();
            
            // Check if note exists, and recreate if needed
            let targetNoteId = clickedNoteId;
            
            try {
              const checkResponse = await fetch(`/api/notes/${clickedNoteId}/details`, {
                method: 'GET',
                credentials: 'include'
              });
              
              // If note doesn't exist and we have a reference, recreate it
              if (!checkResponse.ok && clickedReference) {
                const normalizedRef = clickedReference;
                
                // Fetch verse text first
                let verseText = clickedReference;
                try {
                  const verseResponse = await fetch('/api/scripture/fetch-verse', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ reference: normalizedRef }),
                    credentials: 'include'
                  });

                  if (verseResponse.ok) {
                    const verseData = await verseResponse.json();
                    verseText = verseData.text || clickedReference;
                  }
                } catch (error) {
                  console.error('Error fetching verse text:', error);
                }

                // Create new note with verse text as content
                const formData = new FormData();
                formData.set('content', verseText);
                formData.set('title', clickedReference);
                formData.set('threadId', 'thread_unorganized');
                formData.set('noteType', 'scripture');
                formData.set('scriptureReference', normalizedRef);
                formData.set('scriptureVersion', 'NET');

                const createResponse = await fetch('/api/notes/create', {
                  method: 'POST',
                  body: formData,
                  credentials: 'include'
                });

                if (createResponse.ok) {
                  const result = await createResponse.json();
                  if (result.note && result.note.id) {
                    targetNoteId = result.note.id;
                    
                    // Update the pill's noteId attribute in the editor
                    try {
                      const { from, to } = state.selection;
                      const tr = state.tr;
                      
                      // Find the range of the scripture pill mark by checking the clicked element
                      // We need to find the position in the document that corresponds to this element
                      // Since we're clicking on the element, we can use the selection
                      const $from = state.selection.$from;
                      let pillStart = from;
                      let pillEnd = from;
                      
                      // Find start of pill
                      for (let pos = from; pos >= 0; pos--) {
                        try {
                          const $pos = state.doc.resolve(pos);
                          const marks = $pos.marks();
                          const hasPill = marks.some(m => m.type.name === 'scripturePill');
                          if (!hasPill) {
                            pillStart = pos + 1;
                            break;
                          }
                          if (pos === 0) {
                            pillStart = 0;
                            break;
                          }
                        } catch (e) {
                          pillStart = pos + 1;
                          break;
                        }
                      }
                      
                      // Find end of pill
                      for (let pos = from; pos <= state.doc.content.size; pos++) {
                        try {
                          const $pos = state.doc.resolve(pos);
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
                      
                      // Update the mark with new noteId
                      const markType = state.schema.marks.scripturePill;
                      if (markType) {
                        tr.removeMark(pillStart, pillEnd, markType);
                        tr.addMark(pillStart, pillEnd, markType.create({
                          reference: clickedReference,
                          noteId: targetNoteId
                        }));
                        view.dispatch(tr);
                      }
                    } catch (updateError) {
                      console.error('Error updating pill noteId:', updateError);
                      // Continue with navigation even if update fails
                    }
                    
                    // Show success toast
                    if (window.toast) {
                      window.toast.success(`Scripture note restored: ${clickedReference}`);
                    }
                  }
                }
              }
            } catch (error) {
              console.error('Error checking/restoring note:', error);
            }
            
            window.location.href = `/${targetNoteId}`;
            return true;
          }
        }

        return false;
      },
    };
  },
});

