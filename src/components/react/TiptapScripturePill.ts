import { Mark } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection } from 'prosemirror-state';
import { ReplaceStep } from 'prosemirror-transform';
import { Slice, Fragment } from 'prosemirror-model';
import { navigate } from 'astro:transitions/client';

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
        ({ chain, tr }) => {
          // Clear stored marks when setting a scripture pill
          // This prevents future typing from inheriting formatting
          tr.setStoredMarks([]);
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
      // Handle typing any character after a pill - clear marks
      'Mod-KeyA': () => false, // Don't interfere with select all
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
      // Handle typing any character - check if cursor is after a pill and clear marks
      // This is a catch-all for any character input
      '*': ({ editor, view, event }) => {
        const { state } = editor;
        const { selection } = state;
        const { $from, from, to } = selection;
        
        // Check if cursor is INSIDE a pill
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
        
        // Check if cursor is RIGHT AFTER a pill (not inside, but immediately after)
        if (from > 0 && from === to) {
          try {
            const prevPos = from - 1;
            const $prev = state.doc.resolve(prevPos);
            const prevMarks = $prev.marks();
            const hasPill = prevMarks.some((m: any) => m.type.name === 'scripturePill');
            
            if (hasPill) {
              // Check if this is a printable character
              const key = (event as KeyboardEvent).key;
              const isControlKey = key.length > 1 || 
                ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter', 'Escape', 'Home', 'End', 'PageUp', 'PageDown', 'Backspace', 'Delete'].includes(key);
              
              if (!isControlKey) {
                // Clear ALL stored marks before typing the character
                // This prevents mark inheritance
                const tr = state.tr.setStoredMarks([]);
                editor.view.dispatch(tr);
                // Return false to allow the character to be typed (with cleared marks)
                return false;
              }
            }
          } catch (e) {
            // Ignore errors
          }
        }
        
        return false;
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('scripturePillMarkRemoval'),
        filterTransaction: (transaction, state) => {
          // Clear stored marks BEFORE transaction is applied
          const { selection } = state;
          const { from } = selection;
          
          if (from >= 0 && from === selection.to) {
            // Check if we're at the end of a pill (can be scripturePill or noteLink)
            try {
              const $current = state.doc.resolve(from);
              const currentMarks = $current.marks();
              const currentHasPill = currentMarks.some((m: any) => m.type.name === 'scripturePill' || m.type.name === 'noteLink');
              
              // Check next position (if it exists)
              let nextHasPill = false;
              if (from < state.doc.content.size) {
                try {
                  const $next = state.doc.resolve(from + 1);
                  const nextMarks = $next.marks();
                  nextHasPill = nextMarks.some((m: any) => m.type.name === 'scripturePill' || m.type.name === 'noteLink');
                } catch (e) {
                  nextHasPill = false;
                }
              }
              
              // If current position has pill but next doesn't, we're at the end of the pill
              if (currentHasPill && !nextHasPill) {
                transaction.setStoredMarks([]);
              }
            } catch (e) {
              // Ignore errors
            }
          }
          
          return true;
        },
        appendTransaction: (transactions, oldState, newState) => {
          // Remove marks from text inserted after pills
          const { selection } = newState;
          const { from } = selection;
          
          if (from >= 0 && from === selection.to) {
            // Check if we're at the end of a pill (can be scripturePill or noteLink)
            try {
              const $current = newState.doc.resolve(from);
              const currentMarks = $current.marks();
              const currentHasPill = currentMarks.some((m: any) => m.type.name === 'scripturePill' || m.type.name === 'noteLink');
              
              // Check next position (if it exists)
              let nextHasPill = false;
              if (from < newState.doc.content.size) {
                try {
                  const $next = newState.doc.resolve(from + 1);
                  const nextMarks = $next.marks();
                  nextHasPill = nextMarks.some((m: any) => m.type.name === 'scripturePill' || m.type.name === 'noteLink');
                } catch (e) {
                  nextHasPill = false;
                }
              }
              
              // If current position has pill but next doesn't, we're at the end of the pill
              if (currentHasPill && !nextHasPill) {
                // Check if current position has formatting marks (already resolved above)
                const formattingMarks = currentMarks.filter((m: any) => 
                  m.type.name !== 'scripturePill' && m.type.name !== 'noteLink'
                );
                
                if (formattingMarks.length > 0) {
                  const tr = newState.tr;
                  const schema = newState.schema;
                  const allMarkTypes = Object.values(schema.marks);
                  
                  // Remove all formatting marks from a range after the cursor
                  const removeEnd = Math.min(from + 50, newState.doc.content.size);
                  
                  for (const markType of allMarkTypes) {
                    if (markType.name !== 'scripturePill' && markType.name !== 'noteLink') {
                      try {
                        tr.removeMark(from, removeEnd, markType);
                      } catch (e) {
                        // Continue
                      }
                    }
                  }
                  
                  tr.setStoredMarks([]);
                  
                  if (tr.steps.length > 0) {
                    return tr;
                  }
                }
              }
            } catch (e) {
              // Ignore errors
            }
          }
          
          return null;
        },
        props: {
          handleTextInput(view, from, to, text) {
            const { state } = view;
            
            // Check if we're typing right after a pill
            // ProseMirror marks are inclusive at boundaries, so we need to check:
            // 1. If position from has a pill mark (we're at the end of a pill)
            // 2. AND position from+1 does NOT have a pill mark (we're right after it)
            // NOTE: Pills can be stored as either 'scripturePill' or 'noteLink' marks
            if (from >= 0) {
              try {
                // Check current position
                const $current = state.doc.resolve(from);
                const currentMarks = $current.marks();
                const currentHasPill = currentMarks.some((m: any) => m.type.name === 'scripturePill' || m.type.name === 'noteLink');
                
                // Check next position (if it exists)
                let nextHasPill = false;
                if (from < state.doc.content.size) {
                  try {
                    const $next = state.doc.resolve(from + 1);
                    const nextMarks = $next.marks();
                    nextHasPill = nextMarks.some((m: any) => m.type.name === 'scripturePill' || m.type.name === 'noteLink');
                  } catch (e) {
                    // If we can't resolve next position, assume we're at the end
                    nextHasPill = false;
                  }
                }
                
                // If current position has pill but next doesn't, we're at the end of the pill
                if (currentHasPill && !nextHasPill) {
                  // Insert text without marks
                  const tr = state.tr;
                  tr.setStoredMarks([]);
                  
                  // Insert text explicitly without marks
                  const schema = state.schema;
                  const textNode = schema.text(text, []);
                  tr.replaceWith(from, to, textNode);
                  
                  // Remove all formatting marks from inserted text
                  const allMarkTypes = Object.values(schema.marks);
                  for (const markType of allMarkTypes) {
                    if (markType.name !== 'scripturePill' && markType.name !== 'noteLink') {
                      try {
                        tr.removeMark(from, from + text.length, markType);
                      } catch (e) {
                        // Continue
                      }
                    }
                  }
                  
                  tr.setStoredMarks([]);
                  
                  // Update selection
                  tr.setSelection(TextSelection.near(tr.doc.resolve(from + text.length)));
                  
                  view.dispatch(tr);
                  return true; // Handled
                }
              } catch (e) {
                // Ignore errors
              }
            }
            
            return false; // Let default handler process
          },
        },
        view(editorView) {
          return {
            update(view, prevState) {
              // Monitor state updates and remove marks immediately
              const { state } = view;
              const { selection } = state;
              const { from } = selection;
              
              if (from >= 0 && from === selection.to) {
                // Check if we're at the end of a pill (can be scripturePill or noteLink)
                try {
                  const $current = state.doc.resolve(from);
                  const currentMarks = $current.marks();
                  const currentHasPill = currentMarks.some((m: any) => m.type.name === 'scripturePill' || m.type.name === 'noteLink');
                  
                  // Check next position (if it exists)
                  let nextHasPill = false;
                  if (from < state.doc.content.size) {
                    try {
                      const $next = state.doc.resolve(from + 1);
                      const nextMarks = $next.marks();
                      nextHasPill = nextMarks.some((m: any) => m.type.name === 'scripturePill' || m.type.name === 'noteLink');
                    } catch (e) {
                      nextHasPill = false;
                    }
                  }
                  
                  // If current position has pill but next doesn't, we're at the end of the pill
                  if (currentHasPill && !nextHasPill) {
                    // Check if current position has formatting marks (already resolved above)
                    const formattingMarks = currentMarks.filter((m: any) => 
                      m.type.name !== 'scripturePill' && m.type.name !== 'noteLink'
                    );
                    
                    if (formattingMarks.length > 0) {
                      const tr = state.tr;
                      const schema = state.schema;
                      const allMarkTypes = Object.values(schema.marks);
                      
                      const removeEnd = Math.min(from + 50, state.doc.content.size);
                      
                      for (const markType of allMarkTypes) {
                        if (markType.name !== 'scripturePill' && markType.name !== 'noteLink') {
                          try {
                            tr.removeMark(from, removeEnd, markType);
                          } catch (e) {
                            // Continue
                          }
                        }
                      }
                      
                      tr.setStoredMarks([]);
                      
                      if (tr.steps.length > 0) {
                        view.dispatch(tr);
                      }
                    } else if (state.storedMarks && state.storedMarks.length > 0) {
                      // Clear stored marks even if no formatting marks found
                      const tr = state.tr.setStoredMarks([]);
                      view.dispatch(tr);
                    }
                  }
                } catch (e) {
                  // Ignore errors
                }
              }
            },
          };
        },
      }),
    ];
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
              
              // Get parent thread ID from DOM (the thread this note belongs to)
              const noteElement = document.querySelector('[data-note-id]') as HTMLElement;
              const parentThreadId = noteElement?.dataset.parentThreadId || 'thread_unorganized';
              
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
              // Use parent thread ID so the recreated note is in the same thread as the current note
              const formData = new FormData();
              formData.set('content', verseText);
              formData.set('title', reference);
              formData.set('threadId', parentThreadId);
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
          navigate(`/${targetNoteId}`, { history: 'replace' });
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
                
                // Get parent thread ID from DOM (the thread this note belongs to)
                const noteElement = document.querySelector('[data-note-id]') as HTMLElement;
                const parentThreadId = noteElement?.dataset.parentThreadId || 'thread_unorganized';
                
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
                // Use parent thread ID so the recreated note is in the same thread as the current note
                const formData = new FormData();
                formData.set('content', verseText);
                formData.set('title', clickedReference);
                formData.set('threadId', parentThreadId);
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
            
            navigate(`/${targetNoteId}`, { history: 'replace' });
            return true;
          }
        }

        return false;
      },
    };
  },
});

