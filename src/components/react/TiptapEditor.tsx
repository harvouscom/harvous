import React, { useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import Heading from '@tiptap/extension-heading';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import Superscript from '@tiptap/extension-superscript';
import { TextSelection } from 'prosemirror-state';
import { NoteLink } from './TiptapNoteLink.ts';
import { ScripturePill } from './TiptapScripturePill.ts';
import { BoldCustom } from './TiptapBoldCustom.ts';
import { HighlightCustom } from './TiptapHighlightCustom.ts';
import ButtonSmall from './ButtonSmall';
import { normalizeScriptureReference } from '@/utils/scripture-detector';
import { safeNavigate } from '@/utils/safe-navigate';
import { shouldProcessDocument, getTextToProcess, resetTracker, cleanupTracker } from '@/utils/incremental-scripture-detection';
import '@/styles/tiptap-editor.css';

// Icon component for inline SVGs (allows CSS styling)
import Icon from './Icon';

// Toast is declared globally elsewhere - no need to redeclare here

interface TiptapEditorProps {
  content: string;
  id?: string;
  name?: string;
  placeholder?: string;
  minimalToolbar?: boolean;
  tabindex?: number;
  onContentChange?: (content: string) => void;
  scrollPosition?: number;
  enableCreateNoteFromSelection?: boolean;
  parentThreadId?: string;
  sourceNoteId?: string; // ID of the note this editor is editing (for hyperlink creation)
  onEditorReady?: (editor: any) => void;
}

// Helper function to find text positions in ProseMirror document
// Returns the first occurrence that doesn't already have a scripture pill mark
function findTextPositions(doc: any, searchText: string, skipMarked: boolean = true): { from: number; to: number } | null {
  const allPositions = findAllTextPositions(doc, searchText, skipMarked);
  return allPositions.length > 0 ? allPositions[0] : null;
}

// Helper function to normalize text for flexible matching (handles spacing variations)
function normalizeTextForMatching(text: string): string {
  // Remove spaces around dashes and colons, normalize whitespace
  return text
    .replace(/\s*-\s*/g, '-')  // "16 - 17" -> "16-17"
    .replace(/:\s+/g, ':')     // "3: 16" -> "3:16"
    .replace(/\s+/g, ' ')      // Multiple spaces -> single space
    .trim()
    .toLowerCase();
}

// Helper function to find text positions with flexible matching for verse ranges
function findTextWithFlexibleMatching(fullText: string, searchText: string): Array<{ index: number; length: number }> {
  const normalizedSearch = normalizeTextForMatching(searchText);
  const matches: Array<{ index: number; length: number }> = [];
  
  // Try exact match first
  let index = fullText.indexOf(searchText);
  while (index !== -1) {
    matches.push({ index, length: searchText.length });
    index = fullText.indexOf(searchText, index + 1);
  }
  
  // Also try normalized match (handles spacing variations)
  if (normalizedSearch !== searchText.toLowerCase()) {
    // Build regex pattern that matches with flexible spacing
    const escapedSearch = searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Allow optional spaces around dashes and colons
    const flexiblePattern = escapedSearch
      .replace(/\s*-\s*/g, '\\s*-\\s*')  // Flexible dash spacing
      .replace(/:\s+/g, ':\\s*')         // Flexible colon spacing
      .replace(/\s+/g, '\\s+');          // Flexible general spacing
    
    const regex = new RegExp(flexiblePattern, 'gi');
    let match;
    while ((match = regex.exec(fullText)) !== null) {
      const matchIndex = match.index;
      const matchLength = match[0].length;
      // Avoid duplicates
      if (!matches.some(m => m.index === matchIndex)) {
        matches.push({ index: matchIndex, length: matchLength });
      }
    }
  }
  
  return matches;
}

// Helper function to find ALL text positions in ProseMirror document
// Returns all occurrences that don't already have a scripture pill mark
function findAllTextPositions(doc: any, searchText: string, skipMarked: boolean = true): Array<{ from: number; to: number }> {
  const fullText = doc.textContent;
  
  if (!fullText || fullText.trim().length === 0) {
    return [];
  }
  
  // Find all matches with flexible spacing handling
  const matches = findTextWithFlexibleMatching(fullText, searchText);
  
  if (matches.length === 0) {
    return [];
  }

  // Sort indices to process in order
  matches.sort((a, b) => a.index - b.index);
  
  const positions: Array<{ from: number; to: number }> = [];
  let currentPos = 0;
  
  // Build a map of text positions to document positions
  const textToDocMap: Array<{ textStart: number; textEnd: number; docStart: number }> = [];
  
  doc.nodesBetween(0, doc.content.size, (node: any, pos: number) => {
    if (node.isText) {
      const text = node.text || '';
      const nodeStart = currentPos;
      const nodeEnd = currentPos + text.length;
      
      textToDocMap.push({
        textStart: nodeStart,
        textEnd: nodeEnd,
        docStart: pos
      });
      
      currentPos = nodeEnd;
    }
  });
  
  // For each match, find the corresponding document position
  for (const match of matches) {
    const searchIndex = match.index;
    const matchLength = match.length;
    
    // Find which text node contains this index
    for (const map of textToDocMap) {
      if (searchIndex >= map.textStart && searchIndex < map.textEnd) {
        const offset = searchIndex - map.textStart;
        const candidateFrom = map.docStart + offset;
        const candidateTo = candidateFrom + matchLength;
        
        // Check if this position already has a scripture pill mark
        if (skipMarked) {
          try {
            const $from = doc.resolve(candidateFrom);
            const marks = $from.marks();
            const hasPill = marks.some((m: any) => m.type.name === 'scripturePill');
            if (hasPill) {
              // Skip this position
              continue;
            }
          } catch (e) {
            // If we can't resolve, skip it
            continue;
          }
        }
        
        // Check if this position overlaps with any already found position
        const overlaps = positions.some(p => 
          (candidateFrom >= p.from && candidateFrom < p.to) ||
          (candidateTo > p.from && candidateTo <= p.to) ||
          (candidateFrom <= p.from && candidateTo >= p.to)
        );
        
        if (!overlaps) {
          positions.push({ from: candidateFrom, to: candidateTo });
        }
        break;
      }
    }
  }
  
  return positions;
}

// Helper function to check if reference is already wrapped in a pill
function isReferenceWrapped(htmlContent: string, reference: string): boolean {
  // Normalize the reference to match how it's stored in HTML
  const normalizedRef = normalizeScriptureReference(reference);
  const escapedRef = normalizedRef.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`<span[^>]*data-scripture-reference=["']${escapedRef.replace(/"/g, '&quot;')}["'][^>]*>`, 'i');
  return pattern.test(htmlContent);
}

// Helper function to check/create scripture note and get noteId
async function getOrCreateScriptureNote(reference: string, parentThreadId?: string): Promise<{ noteId: string | null; isNew: boolean }> {
  const normalizedRef = normalizeScriptureReference(reference);
  
  // Check if note exists
  const checkResponse = await fetch('/api/scripture/check-existing', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reference: normalizedRef }),
    credentials: 'include'
  });

  if (checkResponse.ok) {
    const checkResult = await checkResponse.json();
    if (checkResult.exists && checkResult.noteId) {
      // If parent thread is provided, add existing note to that thread
      if (parentThreadId && parentThreadId !== 'thread_unorganized') {
        try {
          const addThreadResponse = await fetch(`/api/notes/${checkResult.noteId}/add-thread`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ threadId: parentThreadId }),
            credentials: 'include'
          });

          // Note: We don't show an error if it's already in the thread (400 status)
          // This is expected behavior and handled silently
          if (addThreadResponse.ok) {
            const result = await addThreadResponse.json();
            if (result.success) {
              // Note was successfully added to thread
              // Optionally show a subtle toast, but keep it quiet to avoid spam
            }
          }
        } catch (error) {
          // Silently fail - note exists, just couldn't add to thread
          // This is non-critical since the note already exists
          console.error('Error adding existing scripture note to thread:', error);
        }
      }
      
      return { noteId: checkResult.noteId, isNew: false };
    }
  }

  // Fetch verse text first
  let verseText = reference; // Fallback to reference if fetch fails
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
    // If verse fetch fails, use reference as fallback
    console.error('Error fetching verse text:', error);
  }

  // Create new note with verse text as content
  // Use parentThreadId if provided, otherwise default to thread_unorganized
  const targetThreadId = parentThreadId || 'thread_unorganized';
  const formData = new FormData();
  formData.set('content', verseText);
  formData.set('title', reference);
  formData.set('threadId', targetThreadId);
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
      // Show success toast
      if (window.toast) {
        window.toast.success(`Scripture note created: ${reference}`);
      }
      return { noteId: result.note.id, isNew: true };
    }
  }

  // Show error toast
  if (window.toast) {
    window.toast.error(`Error creating scripture note: ${reference}`);
  }
  
  return { noteId: null, isNew: false };
}

// Helper function to convert scripture references to pills using processed results data
// This is more reliable than parsing HTML since Tiptap may have already parsed/removed spans
export async function convertScriptureReferencesToPills(
  editor: any, 
  scriptureResults: Array<{ reference: string; noteId: string }>
) {
  if (!editor || !scriptureResults || scriptureResults.length === 0) {
    return;
  }
  
  try {
    // Get fresh document state after content was set
    const doc = editor.state.doc;
    const fullText = doc.textContent;
    
    // Process each scripture reference from the results
    for (const result of scriptureResults) {
      const { reference, noteId } = result;
      if (!reference || !noteId) {
        continue;
      }
      
      const normalizedRef = normalizeScriptureReference(reference);
      
      // Find all positions of this reference in the document
      const positions = findAllTextPositions(doc, reference, true);
      
      if (positions.length === 0) {
        continue;
      }
      
      // Convert each occurrence to a scripture pill
      for (let i = positions.length - 1; i >= 0; i--) {
        const pos = positions[i];
        
        // Check if this position already has a scripture pill mark
        try {
          const $from = doc.resolve(pos.from);
          const marks = $from.marks();
          const hasPill = marks.some((m: any) => m.type.name === 'scripturePill');
          
          if (hasPill) {
            continue; // Already a pill
          }
          
          // Convert to scripture-pill
          editor.chain()
            .setTextSelection(pos)
            .unsetMark('noteLink')
            .setMark('scripturePill', { reference: normalizedRef, noteId })
            .run();
        } catch (e) {
          console.error('Error converting position to pill:', e);
          // Skip if we can't resolve the position
          continue;
        }
      }
    }
  } catch (error) {
    console.error('Error converting scripture references to pills:', error);
  }
}

// Helper function to convert note-link spans and scripture-pill spans to proper scripturePill marks
// This handles cases where HTML contains spans that should be scripture pills but weren't parsed correctly
// (Fallback method for when Tiptap's parseHTML doesn't correctly convert the spans to marks)
export async function convertNoteLinksToScripturePills(editor: any) {
  if (!editor) return;
  
  try {
    const htmlContent = editor.getHTML();
    const doc = editor.state.doc;
    
    // Find all note-link spans and scripture-pill spans in the HTML
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlContent;
    
    // First, handle scripture-pill spans that have both data-scripture-reference and data-note-id
    // These should already be parsed correctly, but may need to be converted to marks
    const scripturePillSpans = tempDiv.querySelectorAll('span.scripture-pill[data-scripture-reference][data-note-id], span[data-scripture-reference][data-note-id]');
    
    for (const pillSpan of Array.from(scripturePillSpans)) {
      const reference = (pillSpan as HTMLElement).getAttribute('data-scripture-reference');
      const noteId = (pillSpan as HTMLElement).getAttribute('data-note-id');
      const pillText = pillSpan.textContent || '';
      
      if (!reference || !noteId || !pillText) continue;
      
      const normalizedRef = normalizeScriptureReference(reference);
      
      // Find positions of this text in the document
      const positions = findAllTextPositions(doc, pillText, false); // Don't skip marked positions
      
      // Convert each occurrence to a scripture pill if not already
      for (let i = positions.length - 1; i >= 0; i--) {
        const pos = positions[i];
        
        try {
          const $from = doc.resolve(pos.from);
          const marks = $from.marks();
          const hasPill = marks.some((m: any) => m.type.name === 'scripturePill');
          
          if (hasPill) {
            continue; // Already a pill mark
          }
          
          // Convert to scripture-pill mark
          editor.chain()
            .setTextSelection(pos)
            .unsetMark('noteLink')
            .setMark('scripturePill', { reference: normalizedRef, noteId })
            .run();
        } catch (e) {
          // Skip if we can't resolve the position
          continue;
        }
      }
    }
    
    // Then, handle note-link spans that might reference scripture notes
    const noteLinks = tempDiv.querySelectorAll('span.note-link[data-note-id]');
    
    if (noteLinks.length === 0) {
      return;
    }
    
    // Check each note-link to see if it references a scripture note
    for (const noteLink of Array.from(noteLinks)) {
      const noteId = (noteLink as HTMLElement).getAttribute('data-note-id');
      if (!noteId) continue;
      
      // Check if this note is a scripture note
      try {
        const checkResponse = await fetch(`/api/notes/${noteId}/details`, {
          method: 'GET',
          credentials: 'include'
        });
        
        if (checkResponse.ok) {
          const noteData = await checkResponse.json();
          if (noteData.note && noteData.note.noteType === 'scripture') {
            // This is a scripture note - we need to get the scripture reference
            // Try to detect it from the link text or fetch from scripture metadata
            const linkText = noteLink.textContent || '';
            
            // First, try to detect if the link text is a scripture reference
            const detectResponse = await fetch('/api/scripture/detect', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text: linkText }),
              credentials: 'include'
            });
            
            let reference = '';
            if (detectResponse.ok) {
              const detection = await detectResponse.json();
              if (detection.isScripture && detection.references && detection.references.length > 0) {
                reference = detection.references[0].reference;
              }
            }
            
            // If we couldn't detect it, try to get it from the note title (scripture notes often have reference as title)
            if (!reference && noteData.note.title) {
              const titleDetectResponse = await fetch('/api/scripture/detect', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: noteData.note.title }),
                credentials: 'include'
              });
              
              if (titleDetectResponse.ok) {
                const titleDetection = await titleDetectResponse.json();
                if (titleDetection.isScripture && titleDetection.references && titleDetection.references.length > 0) {
                  reference = titleDetection.references[0].reference;
                }
              }
            }
            
            if (reference) {
              const normalizedRef = normalizeScriptureReference(reference);
              
              // Find positions of this text in the document
              // Use the linkText which should match what's in the document
              const positions = findAllTextPositions(doc, linkText, true);
              
              // Convert each occurrence to a scripture pill
              for (let i = positions.length - 1; i >= 0; i--) {
                const pos = positions[i];
                
                // Check if this position already has a scripture pill mark
                try {
                  const $from = doc.resolve(pos.from);
                  const marks = $from.marks();
                  const hasPill = marks.some((m: any) => m.type.name === 'scripturePill');
                  
                  if (hasPill) {
                    continue; // Already a pill
                  }
                  
                  // Convert to scripture-pill (whether it has noteLink mark or not)
                  // This handles both cases: HTML spans that became marks, and plain text
                  editor.chain()
                    .setTextSelection(pos)
                    .unsetMark('noteLink')
                    .setMark('scripturePill', { reference: normalizedRef, noteId })
                    .run();
                } catch (e) {
                  // Skip if we can't resolve the position
                  continue;
                }
              }
            }
          }
        }
      } catch (error) {
        // Skip if we can't check the note type
        continue;
      }
    }
  } catch (error) {
    console.error('Error converting note-links to scripture pills:', error);
  }
}

// Helper function to detect and create scripture notes
async function detectAndCreateScriptureNotes(editor: any, parentThreadId?: string, editorId?: string) {
  if (!editor) return;

  try {
    // Store current cursor position before processing
    const currentSelection = editor.state.selection;
    const currentCursorPos = currentSelection.anchor;
    
    // Extract plain text from editor
    const fullText = editor.state.doc.textContent;
    
    if (!fullText || fullText.trim().length < 5) {
      return;
    }

    // Use incremental detection - only process if document has changed
    // Use provided editorId or fallback to 'default' if not available
    const id = editorId || 'default';
    let textForDetection: string = fullText;
    
    // Try incremental detection, but fall back gracefully if it fails
    try {
      if (typeof shouldProcessDocument === 'function' && typeof getTextToProcess === 'function') {
        if (!shouldProcessDocument(id, fullText)) {
          return; // Document hasn't changed, skip detection
        }

        // Get text segment to process (optimized for incremental detection)
        const result = getTextToProcess(id, fullText);
        
        // For incremental detection, we still need to check the full document context
        // to find all occurrences, but we can optimize by only sending new text to API
        // However, for now, we'll use the full text but track state to avoid reprocessing
        textForDetection = result.isFullDocument ? result.text : fullText; // Use full text for context
      }
    } catch (incrementalError) {
      // If incremental detection fails, fall back to processing full text
      // This ensures the app continues to work even if incremental detection has issues
      textForDetection = fullText;
    }

    // Call detection API with optimized text
    const detectResponse = await fetch('/api/scripture/detect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: textForDetection }),
      credentials: 'include'
    });

    if (!detectResponse.ok) {
      return;
    }

    const detection = await detectResponse.json();
    
    if (!detection.isScripture || !detection.references || detection.references.length === 0) {
      return;
    }

    const htmlContent = editor.getHTML();
    const doc = editor.state.doc;

    // Process each detected reference
    for (const ref of detection.references) {
      const reference = ref.reference || ref;
      if (!reference) continue;

      // Normalize reference for consistent checking
      const normalizedRef = normalizeScriptureReference(reference);

      // Find ALL positions in document (will skip positions already marked)
      const allPositions = findAllTextPositions(doc, reference, true);
      
      if (allPositions.length === 0) {
        continue;
      }
      
      // Early exit optimization: Check if ALL positions already have pills
      // This prevents unnecessary processing and visual cycling
      let allPositionsHavePills = true;
      for (const positions of allPositions) {
        try {
          const $from = doc.resolve(positions.from);
          const marks = $from.marks();
          const hasPill = marks.some((m: any) => m.type.name === 'scripturePill');
          if (!hasPill) {
            allPositionsHavePills = false;
            break;
          }
        } catch (e) {
          // If we can't resolve, assume it doesn't have a pill
          allPositionsHavePills = false;
          break;
        }
      }
      
      // Skip this reference entirely if all positions already have pills
      if (allPositionsHavePills) {
        continue;
      }
      
      // Get or create note once for all occurrences of this reference
      // Pass parentThreadId so new notes are created in the correct thread
      const { noteId } = await getOrCreateScriptureNote(reference, parentThreadId);
      
      if (!noteId) {
        // If note creation failed, skip processing this reference
        continue;
      }
      
      // Process each occurrence
      // Note: We process in reverse order (from end to start) to avoid position shifts
      // when marks are applied, since applying a mark doesn't change document size
      // but we'll still process in order for safety
      for (let i = allPositions.length - 1; i >= 0; i--) {
        const positions = allPositions[i];
        
        // Get fresh document state after previous mark applications
        const currentDoc = editor.state.doc;
        
        // Double-check that this position doesn't already have a pill mark
        // (in case it was marked between when we found it and now)
        try {
          const $from = currentDoc.resolve(positions.from);
          const marks = $from.marks();
          const hasPill = marks.some((m: any) => m.type.name === 'scripturePill');
          if (hasPill) {
            continue; // Skip if already marked
          }
        } catch (e) {
          // If we can't resolve, skip this position
          continue;
        }
        
        // Apply scripture pill mark - Tiptap will handle mark boundaries naturally
        editor.chain()
          .setTextSelection(positions)
          .unsetMark('noteLink')
          .setMark('scripturePill', { reference: normalizedRef, noteId })
          .run();
      }
      
      // Restore cursor position to where it was before processing
      // Don't insert any spaces - let Tiptap handle mark boundaries
      try {
        editor.chain()
          .setTextSelection(currentCursorPos)
          .run();
      } catch (e) {
        // If cursor position is invalid, just leave it where it is
      }
    }
  } catch (error) {
    console.error('Error in scripture detection:', error);
    // Don't show error toast for detection errors to avoid spam
  }
}

const TiptapEditor: React.FC<TiptapEditorProps> = ({
  content,
  id = "content",
  name = "content",
  placeholder = "Write something...",
  minimalToolbar = false,
  tabindex,
  onContentChange,
  scrollPosition,
  enableCreateNoteFromSelection = false,
  parentThreadId,
  sourceNoteId,
  onEditorReady
}) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isEditorFocused, setIsEditorFocused] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [activeStates, setActiveStates] = useState({
    bold: false,
    italic: false,
    underline: false,
    orderedList: false,
    bulletList: false,
    headingLevel: 0 // 0 = normal/paragraph, 2 = H2, 3 = H3
  });
  const [showCreateNoteButton, setShowCreateNoteButton] = useState(false);
  const hiddenInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<any>(null);

  // Helper function to check if editor/view is valid before accessing docView
  // This prevents errors when editor is destroyed but handlers still fire
  const isEditorValid = (editorInstance: any): boolean => {
    if (!editorInstance) return false;
    // Check if editor is destroyed
    if (editorInstance.isDestroyed) return false;
    // Check if view exists and is valid
    if (!editorInstance.view) return false;
    // Check if docView exists - this becomes null when editor is destroyed
    if (!editorInstance.view.docView) return false;
    return true;
  };

  // Restore scroll position when provided
  useEffect(() => {
    if (scrollPosition && scrollPosition > 0) {
      const timer = setTimeout(() => {
        const editorContent = document.querySelector('.tiptap-content');
        if (editorContent) {
          editorContent.scrollTop = scrollPosition;
        }
      }, 100);
      
      return () => clearTimeout(timer);
    }
  }, [scrollPosition]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Exclude default Heading extension so we can add custom one with restricted levels
        heading: false,
        // Exclude underline from StarterKit to avoid duplicate extension warning
        underline: false,
        // Exclude bold from StarterKit so we can use custom Bold extension
        bold: false,
      }),
      Heading.configure({
        levels: [2, 3], // Only allow H2, H3 (H1 is reserved for note titles)
      }),
      Underline,
      Superscript,
      BoldCustom, // Use custom Bold extension that prevents application after pills
      HighlightCustom, // Use custom Highlight extension that prevents application after pills
      NoteLink,
      ScripturePill,
      Placeholder.configure({
        placeholder: placeholder,
        showOnlyWhenEditable: true,
        showOnlyCurrent: true,
      }),
    ],
    content: content || '',
    onCreate: ({ editor }) => {
      // Notify parent when editor is ready
      if (onEditorReady) {
        onEditorReady(editor);
      }
    },
    onUpdate: ({ editor }) => {
      const htmlContent = editor.getHTML();
      
      // Update hidden input
      if (hiddenInputRef.current) {
        hiddenInputRef.current.value = htmlContent;
      }
      
      // Notify parent component
      if (onContentChange) {
        onContentChange(htmlContent);
      }
    },
    editable: true,
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none [&_ol]:list-decimal [&_ul]:list-disc',
        style: 'font-family: var(--font-sans); font-size: 16px; font-weight: 500; line-height: 1.6; color: var(--color-deep-grey); min-height: 200px;',
        tabindex: (tabindex || 0).toString(),
      },
      // NOTE: beforeinput handler removed - using plugin's handleTextInput instead
      // This prevents conflicts between DOM-level and ProseMirror-level handlers
      handleDOMEvents: {
        // Let ProseMirror handle all DOM events naturally
        // This ensures cursor placement works correctly on tap
      },
      transformPastedHTML: (html: string) => {
        // Transform heading levels when pasting:
        // H1 → H2, H2 → H3, H3 → H3, H4+ → H3
        if (!html || typeof html !== 'string') {
          return html;
        }
        
        try {
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = html;
          
          // Process all heading tags
          const headings = tempDiv.querySelectorAll('h1, h2, h3, h4, h5, h6');
          headings.forEach((heading) => {
            const level = parseInt(heading.tagName.charAt(1));
            if (isNaN(level) || level < 1 || level > 6) {
              return; // Skip invalid headings
            }
            
            let newLevel: number;
            
            if (level === 1) {
              newLevel = 2; // H1 → H2
            } else if (level === 2) {
              newLevel = 3; // H2 → H3
            } else {
              newLevel = 3; // H3, H4, H5, H6 → H3 (clamp to max)
            }
            
            // Only transform if newLevel is in allowed range [2, 3]
            if (newLevel >= 2 && newLevel <= 3) {
              const newHeading = document.createElement(`h${newLevel}`);
              newHeading.innerHTML = heading.innerHTML;
              // Copy attributes
              Array.from(heading.attributes).forEach(attr => {
                newHeading.setAttribute(attr.name, attr.value);
              });
              if (heading.parentNode) {
                heading.parentNode.replaceChild(newHeading, heading);
              }
            } else {
              // If somehow we get an invalid level, convert to paragraph
              const p = document.createElement('p');
              p.innerHTML = heading.innerHTML;
              Array.from(heading.attributes).forEach(attr => {
                if (attr.name !== 'class' || !attr.value.includes('heading')) {
                  p.setAttribute(attr.name, attr.value);
                }
              });
              if (heading.parentNode) {
                heading.parentNode.replaceChild(p, heading);
              }
            }
          });
          
          return tempDiv.innerHTML;
        } catch (error) {
          return html; // Return original HTML on error
        }
      },
      handleKeyDown: (view, event) => {
        const editor = editorRef.current;
        if (!editor) return false;
        
        // Check if editor is still valid (not destroyed)
        if (!isEditorValid(editor)) return false;
        
        // Check if view.docView is still valid (docView exists at runtime but not in TS types)
        if (!view || !(view as any).docView) return false;
        
        // Handle Cmd+Enter to submit form (dispatch event for parent panels to handle)
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          window.dispatchEvent(new CustomEvent('submitPanelForm'));
          return true;
        }
        
        // Handle Select All (Cmd+A on Mac, Ctrl+A on Windows/Linux)
        if ((event.metaKey || event.ctrlKey) && event.key === 'a') {
          event.preventDefault();
          editor.commands.selectAll();
          return true;
        }
        
        // Handle scripture pill editing prevention
        const { from, to } = view.state.selection;
        const $from = view.state.selection.$from;
        const scripturePillMark = $from.marks().find(mark => mark.type.name === 'scripturePill');
        
        // Detect scripture references when space is pressed (before cursor is in a pill)
        // This provides better UX: user types "John 3:16 " and it converts to a pill immediately
        if (event.key === ' ' && from === to && !scripturePillMark && !event.metaKey && !event.ctrlKey && !event.altKey) {
          // Get text before cursor (back to last space or start of paragraph)
          const doc = view.state.doc;
          let textStart = from;
          
          // Find the start of the current word/phrase (back to space or paragraph start)
          for (let pos = from - 1; pos >= 0; pos--) {
            try {
              const $pos = doc.resolve(pos);
              const char = doc.textBetween(pos, pos + 1);
              
              // Stop at space, newline, or paragraph boundary
              if (char === ' ' || char === '\n' || $pos.parentOffset === 0) {
                textStart = pos + 1;
                break;
              }
              
              // Also stop at start of document
              if (pos === 0) {
                textStart = 0;
                break;
              }
            } catch (e) {
              break;
            }
          }
          
          // Get the potential scripture reference text
          const potentialReference = doc.textBetween(textStart, from);
          
          // Scripture detection removed - now happens on save only
        }
        
        if (scripturePillMark) {
          // Helper to find pill boundaries
          const findPillBoundaries = (doc: any, pos: number): { start: number; end: number } | null => {
            let pillStart = pos;
            let pillEnd = pos;
            
            // Find start of pill
            for (let p = pos; p >= 0; p--) {
              try {
                const $p = doc.resolve(p);
                const marks = $p.marks();
                const hasPill = marks.some((m: any) => m.type.name === 'scripturePill');
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
                const hasPill = marks.some((m: any) => m.type.name === 'scripturePill');
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
          
          // Helper to check if entire pill is selected
          const isEntirePillSelected = (doc: any, from: number, to: number): boolean => {
            const boundaries = findPillBoundaries(doc, from);
            if (!boundaries) return false;
            return from === boundaries.start && to === boundaries.end;
          };
          
          const boundaries = findPillBoundaries(view.state.doc, from);
          
          if (boundaries) {
            // Handle Tab and Space to exit scripture pills
            if (from === to) {
              if (event.key === 'Tab') {
                event.preventDefault();
                // Move cursor to end of pill and unset marks
                editor.chain()
                  .setTextSelection(boundaries.end)
                  .unsetAllMarks()
                  .run();
                return true;
              } else if (event.key === ' ') {
                event.preventDefault();
                // Insert a space after the pill and move cursor after it
                editor.chain()
                  .setTextSelection(boundaries.end)
                  .insertContent(' ')
                  .setTextSelection(boundaries.end + 1)
                  .unsetAllMarks()
                  .run();
                return true;
              }
            }
            
            // Handle Backspace/Delete - only allow if entire pill is selected
            if (event.key === 'Backspace' || event.key === 'Delete') {
              if (!isEntirePillSelected(view.state.doc, from, to)) {
                // Prevent partial deletion - move cursor to end of pill
                event.preventDefault();
                editor.chain()
                  .setTextSelection(boundaries.end)
                  .unsetAllMarks()
                  .run();
                return true;
              }
              // If entire pill is selected, allow normal deletion (return false)
            }
            
            // Prevent all text input when cursor is inside a pill (not entire selection)
            if (from === to) {
              // Check if this is a printable character (not a control key)
              const isControlKey = event.key.length > 1 || 
                ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter', 'Escape', 'Home', 'End', 'PageUp', 'PageDown', 'Backspace', 'Delete'].includes(event.key);
              
              if (!isControlKey && !event.metaKey && !event.ctrlKey && !event.altKey) {
                // Move cursor to end of pill and clear marks before typing
                editor.chain()
                  .setTextSelection(boundaries.end)
                  .unsetAllMarks()
                  .run();
                // Then allow the character to be typed (return false to allow default)
                return false;
              }
            }
          }
        }
        
        // Handle Auto-Capitalize First Line
        // Check if cursor is at the very start of the document
        const isAtDocumentStart = from === to && (
          from === 1 || // Empty document or at very start
          ($from.depth === 1 && $from.parentOffset === 0 && $from.parent.type.name === 'paragraph') // Start of first paragraph
        );
        
        if (isAtDocumentStart) {
          // Check if a single lowercase letter is being typed (but not during paste or other shortcuts)
          if (!event.metaKey && !event.ctrlKey && !event.altKey && event.key.length === 1 && /^[a-z]$/.test(event.key)) {
            event.preventDefault();
            // Insert the uppercase version instead
            editor.commands.insertContent(event.key.toUpperCase());
            return true;
          }
        }
        
        return false;
      },
    },
    // Fix SSR issues
    immediatelyRender: false,
  });

  // Store editor in ref for handleKeyDown access
  useEffect(() => {
    if (editor) {
      editorRef.current = editor;
      // Initialize previous text content reference
    }
    
    // Cleanup tracker when editor is destroyed
    return () => {
      if (id) {
        cleanupTracker(id);
      }
    };
  }, [editor, id]);

  // Update content from props, but only if it's different and editor is not focused
  // This preserves marks that are already in the editor
  useEffect(() => {
    if (!editor || !content) return;
    
    // Check if editor is still valid
    if (!isEditorValid(editor)) return;
    
    // Only update if editor is not focused (to avoid interrupting user typing)
    if (!editor.isFocused) {
      const currentContent = editor.getHTML();
      // Only update if content actually changed (prevents unnecessary updates that clear marks)
      if (currentContent !== content) {
        // Use setContent with emitUpdate: false to prevent triggering detection
        // This preserves marks that are in the HTML content
        editor.commands.setContent(content, { emitUpdate: false });
        
        // Move cursor to end of content to avoid getting stuck on scripture pills
        const cursorTimeout = setTimeout(() => {
          if (isEditorValid(editor) && !editor.isFocused) {
            try {
              const doc = editor.state.doc;
              const endPos = doc.content.size;
              editor.commands.setTextSelection(endPos);
            } catch (e) {
              // Ignore if setting selection fails
            }
          }
        }, 100);
        
        // Convert any note-link spans to scripture-pill marks if they reference scripture notes
        // Scripture detection now happens on save only, not on content load
        const conversionTimeout = setTimeout(async () => {
          if (isEditorValid(editor) && !editor.isFocused) {
            // Convert note-links to scripture pills
            await convertNoteLinksToScripturePills(editor);
          }
        }, 500);
        
        return () => {
          clearTimeout(cursorTimeout);
          clearTimeout(conversionTimeout);
        };
      }
    }
  }, [editor, content]);

  // Ensure editor is focused and editable
  useEffect(() => {
    if (editor) {
      // Focus the editor when it receives focus via tab
      const handleFocus = () => {
        editor.commands.focus();
      };
      
      const editorElement = document.querySelector(`#${id} .ProseMirror`);
      if (editorElement) {
        editorElement.addEventListener('focus', handleFocus);
        
        return () => {
          editorElement.removeEventListener('focus', handleFocus);
        };
      }
    }
  }, [editor, id]);

  // Helper function to detect if selection has formatting
  const hasFormatting = (editor: any): boolean => {
    if (!editor) return false;
    
    const { from, to } = editor.state.selection;
    if (from === to) return false;
    
    let hasMarks = false;
    let hasComplexNodes = false;
    
    editor.state.doc.nodesBetween(from, to, (node: any) => {
      // Check for marks (bold, italic, underline, etc.)
      if (node.marks && node.marks.length > 0) {
        hasMarks = true;
      }
      // Check for non-paragraph nodes (lists, headings, etc.)
      if (node.type.name !== 'paragraph' && node.type.name !== 'text') {
        hasComplexNodes = true;
      }
    });
    
    return hasMarks || hasComplexNodes;
  };

  // Helper function to validate selection
  const isValidSelection = (editor: any): boolean => {
    if (!editor) return false;
    
    const { from, to } = editor.state.selection;
    // Return true for any non-empty selection (no minimum length required)
    return from !== to;
  };

  // Selection detection for create note button
  useEffect(() => {
    if (!editor || !enableCreateNoteFromSelection) {
      setShowCreateNoteButton(false);
      return;
    }

    const updateSelection = () => {
      // Check if editor is still valid before accessing it
      if (!isEditorValid(editor)) {
        setShowCreateNoteButton(false);
        return;
      }
      if (isValidSelection(editor)) {
        setShowCreateNoteButton(true);
      } else {
        setShowCreateNoteButton(false);
      }
    };

    editor.on('selectionUpdate', updateSelection);

    return () => {
      if (editor && !editor.isDestroyed) {
        editor.off('selectionUpdate', updateSelection);
      }
    };
  }, [editor, enableCreateNoteFromSelection]);

  // Handle create note from selection
  const handleCreateNoteFromSelection = async () => {
    if (!editor) return;
    
    // Check if editor is still valid before accessing it
    if (!isEditorValid(editor)) return;
    
    const { from, to } = editor.state.selection;
    if (from === to) return;
    
    // Determine if we should preserve formatting
    const preserveFormatting = hasFormatting(editor);
    
    // Extract content
    let extractedContent: string;
    
    if (preserveFormatting) {
      // For formatted content, extract HTML from DOM selection
      const view = editor?.view;
      // Check for both view and docView - docView becomes null when editor is destroyed
      if (!view || !(view as any).docView) {
        // Fallback to plain text if view is not available or editor is destroyed
        extractedContent = editor.state.doc.textBetween(from, to);
      } else {
        try {
          const startPos = view.domAtPos(from);
          const endPos = view.domAtPos(to);
      
          // Get the DOM nodes in the selection
          if (startPos?.node && endPos?.node) {
            try {
              const range = document.createRange();
              range.setStart(startPos.node, startPos.offset);
              range.setEnd(endPos.node, endPos.offset);
              const htmlFragment = range.cloneContents();
              const tempDiv = document.createElement('div');
              tempDiv.appendChild(htmlFragment);
              extractedContent = tempDiv.innerHTML;
            } catch (e) {
              // Fallback to plain text if DOM extraction fails
              extractedContent = editor.state.doc.textBetween(from, to);
            }
          } else {
            // Fallback to plain text
            extractedContent = editor.state.doc.textBetween(from, to);
          }
        } catch (e) {
          // If domAtPos fails, fallback to plain text
          extractedContent = editor.state.doc.textBetween(from, to);
        }
      }
    } else {
      // Plain text - use textBetween
      extractedContent = editor.state.doc.textBetween(from, to);
    }
    
    // Detect if this is scripture
    try {
      const plainText = extractedContent.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      
      if (plainText.length >= 5) {
        const detectResponse = await fetch('/api/scripture/detect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: plainText }),
          credentials: 'include'
        });

        if (detectResponse.ok) {
          const detection = await detectResponse.json();
          
          if (detection.isScripture && detection.confidence >= 0.7 && detection.primaryReference) {
            try {
              // Normalize the reference before checking to ensure consistent format matching
              const normalizedReference = normalizeScriptureReference(detection.primaryReference);
              
              const checkExistingResponse = await fetch('/api/scripture/check-existing', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reference: normalizedReference }),
                credentials: 'include'
              });

              if (checkExistingResponse.ok) {
                const existingCheck = await checkExistingResponse.json();
                
                if (existingCheck.exists && existingCheck.noteId) {
                  // Existing note found - automatically add to thread
                  const targetThreadId = parentThreadId || localStorage.getItem('newNoteThread') || 'thread_unorganized';
                  
                  try {
                    const addThreadResponse = await fetch(`/api/notes/${existingCheck.noteId}/add-thread`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ threadId: targetThreadId }),
                      credentials: 'include'
                    });

                    let result;
                    try {
                      result = await addThreadResponse.json();
                    } catch (jsonError) {
                      // If JSON parsing fails, log and continue - will fall through to new note creation
                      console.error('[TiptapEditor] Failed to parse add-thread response:', jsonError);
                      result = { error: 'Failed to parse response' };
                    }

                    if (addThreadResponse.ok) {
                      // Success case - note was added to thread
                      if (result.success) {
                        const toastMessage = `Added ${normalizedReference} to this thread`;
                        if (window.toast) {
                          window.toast.info(toastMessage);
                        }
                      }
                      
                      // After adding to thread, fire event to create hyperlink in the source note
                      const { from, to } = editor.state.selection;
                      // Get plainText for HTML manipulation fallback (view mode)
                      const plainTextForMatching = editor.state.doc.textBetween(from, to, ' ');
                      window.dispatchEvent(new CustomEvent('createHyperlink', {
                          detail: {
                              sourceNoteId,
                              newNoteId: existingCheck.noteId, // Use the ID of the existing note
                              from,
                              to,
                              plainText: plainTextForMatching || null, // Include plainText for fallback text matching
                          }
                      }));
                    } else if (addThreadResponse.status === 400) {
                      // Handle 400 status - could be "already in thread" or other validation errors
                      const errorMessage = result.error || 'Unknown error';
                      
                      // Check if it's the "already in thread" case (flexible matching)
                      const isAlreadyInThread = errorMessage.includes('already in this thread') || 
                                                errorMessage.includes('already in thread') ||
                                                errorMessage === 'Note is already in this thread';
                      
                      if (isAlreadyInThread) {
                        // Note is already in thread - show toast using multiple methods
                        const toastMessage = `${normalizedReference} is already in this thread.`;
                        
                        // Dispatch a custom event for the layout to handle.
                        // This is more robust than calling window.toast directly.
                        window.dispatchEvent(new CustomEvent('showToast', {
                          detail: {
                            message: toastMessage,
                            type: 'info'
                          }
                        }));
                        
                        // After confirming note is in thread, fire event to create hyperlink in the source note
                        const { from, to } = editor.state.selection;
                        // Get plainText for HTML manipulation fallback (view mode)
                        const plainTextForMatching = editor.state.doc.textBetween(from, to, ' ');
                        window.dispatchEvent(new CustomEvent('createHyperlink', {
                            detail: {
                                sourceNoteId,
                                newNoteId: existingCheck.noteId, // Use the ID of the existing note
                                from,
                                to,
                                plainText: plainTextForMatching || null, // Include plainText for fallback text matching
                            }
                        }));
                      } else {
                        // Other 400 error - log but don't show toast (will fall through to new note creation)
                        console.warn('[TiptapEditor] Error adding note to thread (not "already in thread"):', errorMessage);
                      }
                    } else {
                      console.error('[TiptapEditor] Unexpected response status when adding note to thread:', addThreadResponse.status, result);
                    }
                  } catch (addError) {
                    // Error adding existing note to thread, falling back to new note creation
                    console.error('[TiptapEditor] Error in addThreadResponse:', addError);
                  }
                  
                  // Clear selection and close
                  editor.commands.blur();
                  setShowCreateNoteButton(false);
                  return; // Exit early - don't create new note
                }
              } else {
                // Non-OK response from check-existing API
                const errorText = await checkExistingResponse.text().catch(() => 'Unknown error');
                console.error('[TiptapEditor] Error checking for existing scripture note:', checkExistingResponse.status, errorText);
                // Continue to create new note since check failed
              }
            } catch (checkError) {
              // Error checking for existing scripture note
              console.error('[TiptapEditor] Exception while checking for existing scripture note:', checkError);
              // Continue to create new note since check failed
            }

            // No existing note found - proceed with creating new note
            // Fetch verse text
            try {
              const verseResponse = await fetch('/api/scripture/fetch-verse', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reference: detection.primaryReference }),
                credentials: 'include'
              });

              if (verseResponse.ok) {
                const verseData = await verseResponse.json();
                
                // Store scripture detection metadata (keep original format, no divider)
                localStorage.setItem('newNoteType', 'scripture');
                localStorage.setItem('newNoteScriptureReference', detection.primaryReference);
                localStorage.setItem('newNoteScriptureVersion', 'NET');
                localStorage.setItem('newNoteScriptureText', verseData.text);
                localStorage.setItem('newNoteTitle', detection.primaryReference); // Reference becomes title
                localStorage.setItem('newNoteContent', verseData.text); // Verse text becomes content
              } else {
                // Detection succeeded but verse fetch failed - still mark as scripture
                localStorage.setItem('newNoteType', 'scripture');
                localStorage.setItem('newNoteScriptureReference', detection.primaryReference);
                localStorage.setItem('newNoteScriptureVersion', 'NET');
                localStorage.setItem('newNoteTitle', detection.primaryReference);
                localStorage.setItem('newNoteContent', extractedContent); // Fallback to original content
              }
            } catch (verseError) {
              // Still mark as scripture even if verse fetch fails
              localStorage.setItem('newNoteType', 'scripture');
              localStorage.setItem('newNoteScriptureReference', detection.primaryReference);
              localStorage.setItem('newNoteScriptureVersion', 'NET');
              localStorage.setItem('newNoteTitle', detection.primaryReference);
              localStorage.setItem('newNoteContent', extractedContent);
            }
          } else {
            // Not scripture - clear any previous scripture metadata
            localStorage.removeItem('newNoteType');
            localStorage.removeItem('newNoteScriptureReference');
            localStorage.removeItem('newNoteScriptureVersion');
            localStorage.removeItem('newNoteScriptureText');
            localStorage.setItem('newNoteContent', extractedContent);
          }
        }
      } else {
        // Too short to check - just store content
        localStorage.setItem('newNoteContent', extractedContent);
      }
    } catch (error) {
      // Continue anyway - don't block note creation
      localStorage.setItem('newNoteContent', extractedContent);
    }
    
    // Store parent thread ID if provided
    if (parentThreadId) {
      localStorage.setItem('newNoteThread', parentThreadId);
    }
    
    // Store source note context for hyperlink creation
    if (sourceNoteId) {
      localStorage.setItem('newNoteSourceNoteId', sourceNoteId);
      localStorage.setItem('newNoteSourceSelectionFrom', from.toString());
      localStorage.setItem('newNoteSourceSelectionTo', to.toString());
      // Also store plain text version for matching in HTML
      const plainTextForMatching = editor.state.doc.textBetween(from, to, ' ');
      localStorage.setItem('newNoteSourceSelectionPlainText', plainTextForMatching);
    }
    
    // Set localStorage first (as backup in case event listener isn't ready yet)
    localStorage.setItem('showNewNotePanel', 'true');
    localStorage.setItem('showNewThreadPanel', 'false');
    
    // Dispatch event to open NewNotePanel
    window.dispatchEvent(new CustomEvent('openNewNotePanel'));
    
    // Clear selection
    editor.commands.blur();
    setShowCreateNoteButton(false);
  };

  // Handle note link clicks
  useEffect(() => {
    if (!editor) return;

    const handleClick = (event: MouseEvent) => {
      // Check if editor is still valid
      if (!isEditorValid(editor)) return;
      
      const target = event.target as HTMLElement;
      if (target.classList.contains('note-link')) {
        const noteId = target.getAttribute('data-note-id');
        if (noteId) {
          event.preventDefault();
          event.stopPropagation();
          safeNavigate(`/${noteId}`, { history: 'replace' });
        }
      }
    };

    const editorElement = editor?.view?.dom;
    if (editorElement) {
      editorElement.addEventListener('click', handleClick);
    }

    return () => {
      if (editorElement) {
        editorElement.removeEventListener('click', handleClick);
      }
    };
  }, [editor]);

  // Track editor focus state
  useEffect(() => {
    if (!editor) return;

    const handleFocus = () => {
      // Check if editor is still valid
      if (!isEditorValid(editor)) return;
      
      // Prevent unwanted scroll jumps on mobile by maintaining scroll position
      // ProseMirror will handle cursor placement naturally at tap location
      const editorElement = editor.view.dom;
      const contentContainer = editorElement?.closest('.tiptap-content') as HTMLElement;
      
      if (contentContainer) {
        // Store scroll position to prevent jumps when keyboard opens
        const scrollTop = contentContainer.scrollTop;
        
        // Use requestAnimationFrame to maintain scroll after browser potentially scrolls
        requestAnimationFrame(() => {
          if (contentContainer && Math.abs(contentContainer.scrollTop - scrollTop) > 10) {
            // Only restore if there was a significant jump (>10px)
            // This prevents interference with intentional scrolling
            contentContainer.scrollTop = scrollTop;
          }
        });
      }
      
      setIsEditorFocused(true);
    };

    const handleBlur = (event: any) => {
      // Check if editor is still valid
      if (!isEditorValid(editor)) return;
      
      // Don't hide toolbar if blur is caused by clicking toolbar button
      // Check if the related target (what's being focused) is within the toolbar
      const relatedTarget = event.event?.relatedTarget;
      if (relatedTarget) {
        const toolbar = document.querySelector('.tiptap-toolbar');
        if (toolbar && toolbar.contains(relatedTarget)) {
          // Blur is from clicking toolbar button, keep toolbar visible
          return;
        }
      }
      // Small delay to allow focus to return to editor if needed
      setTimeout(() => {
        if (isEditorValid(editor) && !editor.isFocused) {
          setIsEditorFocused(false);
        }
      }, 100);
    };

    editor.on('focus', handleFocus);
    editor.on('blur', handleBlur);

    // Set initial focus state
    if (isEditorValid(editor)) {
      setIsEditorFocused(editor.isFocused);
    }

    return () => {
      if (editor && !editor.isDestroyed) {
        editor.off('focus', handleFocus);
        editor.off('blur', handleBlur);
      }
    };
  }, [editor]);

  // Handle virtual keyboard for consistent toolbar positioning
  // On iOS Safari, we need to track both resize AND scroll events on visualViewport
  // because position:fixed is relative to the layout viewport, not the visual viewport
  useEffect(() => {
    const visualViewport = window.visualViewport;
    if (!visualViewport) return;
    
    let rafId: number | null = null;
    let delayedUpdateTimeout: ReturnType<typeof setTimeout> | null = null;
    let isUpdating = false;
    let initializationTimeouts: ReturnType<typeof setTimeout>[] = [];
    let resizeObserver: ResizeObserver | null = null;

    // Detect if editor is inside bottom sheet
    const isInBottomSheet = (): boolean => {
      if (!editor?.view?.dom) return false;
      const editorElement = editor.view.dom;
      return !!(
        editorElement.closest('.bottom-sheet') ||
        editorElement.closest('.drawer-panel') ||
        editorElement.closest('[data-radix-dialog-content]')
      );
    };

    // Get bottom sheet container if it exists
    const getBottomSheetContainer = (): HTMLElement | null => {
      if (!editor?.view?.dom) return null;
      const editorElement = editor.view.dom;
      return (
        editorElement.closest('.bottom-sheet') ||
        editorElement.closest('.drawer-panel') ||
        editorElement.closest('[data-radix-dialog-content]')
      ) as HTMLElement | null;
    };

    const updateToolbarPosition = () => {
      // Prevent multiple simultaneous updates
      if (isUpdating) return;
      
      // Use requestAnimationFrame for smoother updates
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
      
      rafId = requestAnimationFrame(() => {
        isUpdating = true;
        
        // Calculate the distance from the bottom of the layout viewport to the bottom of the visual viewport
        // This accounts for both keyboard height AND scroll position
        const bottomOffset = window.innerHeight - visualViewport.offsetTop - visualViewport.height;
        
        // Account for bottom sheet if editor is inside one
        let adjustedOffset = bottomOffset;
        if (isInBottomSheet()) {
          const bottomSheetContainer = getBottomSheetContainer();
          if (bottomSheetContainer) {
            // Get the bottom sheet's position relative to viewport
            const rect = bottomSheetContainer.getBoundingClientRect();
            const bottomSheetBottom = rect.bottom;
            const viewportBottom = window.innerHeight;
            
            // If bottom sheet doesn't extend to bottom of viewport, adjust calculation
            // Bottom sheet uses 90dvh, so there's a gap at the bottom
            const gapAtBottom = viewportBottom - bottomSheetBottom;
            
            // Adjust offset to account for bottom sheet's constrained viewport
            // The keyboard height should be relative to the bottom sheet's bottom, not viewport bottom
            if (bottomOffset > 150) {
              // Keyboard is open - calculate relative to bottom sheet
              adjustedOffset = bottomOffset - gapAtBottom;
            }
          }
        }
        
        // Only apply special positioning if keyboard is likely open (>150px threshold)
        if (adjustedOffset > 150) {
          // Update immediately for responsive positioning
          setKeyboardHeight(adjustedOffset);
          
          // Schedule a delayed update to catch the final keyboard height after animation
          // This fixes the issue where initial tap shows toolbar peeking behind keyboard
          if (delayedUpdateTimeout) {
            clearTimeout(delayedUpdateTimeout);
          }
          delayedUpdateTimeout = setTimeout(() => {
            const finalBottomOffset = window.innerHeight - visualViewport.offsetTop - visualViewport.height;
            let finalAdjustedOffset = finalBottomOffset;
            
            if (isInBottomSheet()) {
              const bottomSheetContainer = getBottomSheetContainer();
              if (bottomSheetContainer) {
                const rect = bottomSheetContainer.getBoundingClientRect();
                const bottomSheetBottom = rect.bottom;
                const viewportBottom = window.innerHeight;
                const gapAtBottom = viewportBottom - bottomSheetBottom;
                
                if (finalBottomOffset > 150) {
                  finalAdjustedOffset = finalBottomOffset - gapAtBottom;
                }
              }
            }
            
            if (finalAdjustedOffset > 150) {
              setKeyboardHeight(finalAdjustedOffset);
            }
          }, 150);
        } else {
          setKeyboardHeight(0);
        }
        
        isUpdating = false;
      });
    };

    // Listen to both resize (keyboard open/close) and scroll (user scrolling with keyboard open)
    visualViewport.addEventListener('resize', updateToolbarPosition);
    visualViewport.addEventListener('scroll', updateToolbarPosition);
    
    // Also listen to window resize as fallback
    window.addEventListener('resize', updateToolbarPosition);
    
    // Watch for bottom sheet container size changes
    if (isInBottomSheet()) {
      const bottomSheetContainer = getBottomSheetContainer();
      if (bottomSheetContainer && typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(() => {
          updateToolbarPosition();
        });
        resizeObserver.observe(bottomSheetContainer);
      }
    }
    
    // Multiple initialization checks to catch viewport changes
    // Immediate check (0ms)
    updateToolbarPosition();
    
    // After a brief delay (100ms) - catches initial render
    initializationTimeouts.push(setTimeout(() => {
      updateToolbarPosition();
    }, 100));
    
    // After bottom sheet animation completes (~300ms)
    initializationTimeouts.push(setTimeout(() => {
      updateToolbarPosition();
    }, 300));
    
    // After visual viewport stabilizes (500ms)
    initializationTimeouts.push(setTimeout(() => {
      updateToolbarPosition();
    }, 500));
    
    return () => {
      visualViewport.removeEventListener('resize', updateToolbarPosition);
      visualViewport.removeEventListener('scroll', updateToolbarPosition);
      window.removeEventListener('resize', updateToolbarPosition);
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
      if (delayedUpdateTimeout) {
        clearTimeout(delayedUpdateTimeout);
      }
      initializationTimeouts.forEach(timeout => clearTimeout(timeout));
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, [editor]);

  // Update active states when editor changes
  useEffect(() => {
    if (!editor) {
      return;
    }

    const updateActiveStates = () => {
      // Check if editor is still valid before accessing it
      if (!isEditorValid(editor)) return;
      
      // Detect current heading level (0 = paragraph, 2 = H2, 3 = H3)
      let headingLevel = 0;
      if (editor.isActive('heading', { level: 2 })) {
        headingLevel = 2;
      } else if (editor.isActive('heading', { level: 3 })) {
        headingLevel = 3;
      }
      
      const newStates = {
        bold: editor.isActive('bold'),
        italic: editor.isActive('italic'),
        underline: editor.isActive('underline'),
        orderedList: editor.isActive('orderedList'),
        bulletList: editor.isActive('bulletList'),
        headingLevel: headingLevel
      };
      setActiveStates(newStates);
    };

    // Update on selection change
    editor.on('selectionUpdate', updateActiveStates);
    editor.on('update', updateActiveStates);

    // Initial update
    updateActiveStates();

    return () => {
      if (editor && !editor.isDestroyed) {
        editor.off('selectionUpdate', updateActiveStates);
        editor.off('update', updateActiveStates);
      }
    };
  }, [editor]);

  // Set isLoaded immediately - SVG icons are imported directly
  useEffect(() => {
    setIsLoaded(true);
  }, []);

  // Show loading state if editor is not ready yet
  // Component is client-only, so we don't need isClient check
  if (!editor) {
    return (
      <div className="tiptap-editor-container">
        <input
          ref={hiddenInputRef}
          type="hidden"
          id={id}
          name={name}
          value={content}
        />
        <div className="min-h-[200px] p-4" style={{ color: 'var(--color-pebble-grey)' }}>
          Loading editor...
        </div>
      </div>
    );
  }

  // Handle heading cycle: H2 → H3 → Normal → H2
  const handleHeadingCycle = () => {
    if (!editor) return;
    
    const currentLevel = activeStates.headingLevel;
    
    if (currentLevel === 0) {
      // Currently paragraph, set to H2
      editor.chain().focus().setHeading({ level: 2 }).run();
    } else if (currentLevel === 2) {
      // Currently H2, set to H3
      editor.chain().focus().setHeading({ level: 3 }).run();
    } else if (currentLevel === 3) {
      // Currently H3, set to paragraph (normal)
      editor.chain().focus().setParagraph().run();
    }
  };

  const ToolbarButton = ({ 
    onClick, 
    isActive, 
    children, 
    title,
    ariaLabel 
  }: { 
    onClick: () => void; 
    isActive: boolean; 
    children: React.ReactNode; 
    title: string;
    ariaLabel?: string;
  }) => {
    const iconRef = React.useRef<HTMLDivElement>(null);
    
    return (
      <button
        type="button"
        onMouseDown={(e) => {
          // Use onMouseDown to prevent editor from losing focus
          e.preventDefault();
          e.stopPropagation();
          
          // Visual feedback for click
          e.currentTarget.style.setProperty('filter', 'brightness(0.97)', 'important');
          e.currentTarget.style.setProperty('transform', 'scale(0.98)', 'important');
          
          // Execute the command
          onClick();
          
          // Ensure editor stays focused after command
          setTimeout(() => {
            if (editor && !editor.isFocused) {
              editor.commands.focus();
            }
          }, 0);
        }}
        onClick={(e) => {
          // Prevent default click behavior
          e.preventDefault();
          e.stopPropagation();
        }}
        className={`flex items-center justify-center min-w-[2.5rem] min-h-[2.5rem] px-3 py-2 rounded-lg transition-all duration-200 relative ${isActive ? 'ql-active' : ''}`}
        title={title}
        aria-label={ariaLabel || title}
        style={{
          fontFamily: 'var(--font-sans) !important',
          fontSize: '14px !important',
          fontWeight: '500 !important',
          color: 'var(--color-deep-grey) !important',
          background: 'transparent !important',
          border: 'none !important',
          borderRadius: '8px !important',
          padding: '8px 12px !important',
          margin: '0 !important',
          minWidth: '40px !important',
          minHeight: '40px !important',
          display: 'flex !important',
          alignItems: 'center !important',
          justifyContent: 'center !important',
          boxShadow: 'none !important',
          cursor: 'pointer !important',
          transition: '0.2s ease-in-out !important'
        }}
        onMouseEnter={() => {
          // Change icon color on hover - deep grey
          if (iconRef.current) {
            iconRef.current.style.setProperty('color', 'var(--color-deep-grey)', 'important');
          }
        }}
        onMouseLeave={() => {
          // Reset icon color - deep grey for active, gray for inactive
          if (iconRef.current) {
            iconRef.current.style.setProperty('color', isActive ? 'var(--color-deep-grey)' : 'var(--color-gray)', 'important');
          }
        }}
        onMouseUp={(e) => {
          // Visual feedback for click
          e.currentTarget.style.setProperty('filter', 'none', 'important');
          e.currentTarget.style.setProperty('transform', 'none', 'important');
        }}
      >
        <div 
          ref={iconRef}
          style={{ 
            width: '20px',
            height: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: isActive ? 'var(--color-deep-grey)' : 'var(--color-gray)',
            transition: 'color 0.2s ease-in-out',
          }}
        >
          {children}
        </div>
        {isActive && (
          <div 
            className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-1 h-1 bg-[var(--color-deep-grey)] rounded-full"
            style={{
              position: 'absolute',
              bottom: '0px',
              left: '50%',
              transform: 'translateX(-50%)',
              width: '4px',
            height: '4px',
            background: 'var(--color-deep-grey)',
            borderRadius: '50%',
            zIndex: 1
          }}
        />
        )}
      </button>
    );
  };

  return (
    <div className="tiptap-editor-container flex flex-col" style={{ height: '100%', minHeight: 0, width: '100%' }}>
      {/* Hidden input for form submission */}
      <input
        ref={hiddenInputRef}
        type="hidden"
        id={id}
        name={name}
        value={editor.getHTML()}
      />
      
      {/* Editor content area */}
      <div 
        className="tiptap-content flex-1 min-h-0 overflow-auto"
        style={{ height: 0 }}
        onClick={(e) => {
          if (editor) {
            // Let ProseMirror handle natural cursor placement at click position
            // The CSS will prevent unwanted scrolling behavior
            editor.commands.focus();
          }
        }}
      >
        <EditorContent editor={editor} />
        {enableCreateNoteFromSelection && (
          <BubbleMenu
            editor={editor}
            shouldShow={({ editor }) => {
              // Check if editor is still valid before checking selection
              if (!isEditorValid(editor)) return false;
              return isValidSelection(editor);
            }}
          >
            <div style={{ zIndex: 99999, pointerEvents: 'auto', display: 'inline-block' }}>
              <ButtonSmall
                state="Default"
                onMouseDown={(e: React.MouseEvent) => {
                  // Use onMouseDown for better reliability in Floating UI portals
                  e.preventDefault();
                  e.stopPropagation();
                  handleCreateNoteFromSelection();
                }}
                type="button"
              >
                <Icon name="plus" size={14} style={{ display: 'inline-block', marginRight: '8px', fill: 'currentColor' }} />
                <span>Create Note</span>
              </ButtonSmall>
            </div>
          </BubbleMenu>
        )}
      </div>
      
      {/* Custom SpaceButton-styled toolbar - positioned at bottom */}
        {!minimalToolbar && isEditorFocused && (
          <div 
            className="tiptap-toolbar flex gap-1 items-center p-1 border border-[var(--color-fog-white)] rounded-xl bg-[var(--color-snow-white)] shrink-0"
            style={keyboardHeight > 0 ? {
              // When keyboard is open: float above keyboard
              position: 'fixed',
              bottom: `${keyboardHeight + 12}px`,
              left: '1rem',
              right: '1rem',
              width: 'calc(100% - 2rem)',
              zIndex: 50,
            } : {
              // When no keyboard: stay in document flow (above footer buttons)
              position: 'relative',
              marginTop: '8px',
            }}
          >
          <ToolbarButton
            onClick={() => {
              if (!editor) {
                return;
              }
              editor.chain().focus().toggleBold().run();
            }}
            isActive={activeStates.bold}
            title="bold"
            ariaLabel="Toggle bold"
          >
            <Icon name="bold" size={20} style={{ fill: 'currentColor' }} />
          </ToolbarButton>
          
          <ToolbarButton
            onClick={() => {
              if (!editor) {
                return;
              }
              editor.chain().focus().toggleItalic().run();
            }}
            isActive={activeStates.italic}
            title="italic"
            ariaLabel="Toggle italic"
          >
            <Icon name="italic" size={20} style={{ fill: 'currentColor' }} />
          </ToolbarButton>
          
          <ToolbarButton
            onClick={() => {
              if (!editor) {
                return;
              }
              editor.chain().focus().toggleUnderline().run();
            }}
            isActive={activeStates.underline}
            title="underline"
            ariaLabel="Toggle underline"
          >
            <Icon name="underline" size={20} style={{ fill: 'currentColor' }} />
          </ToolbarButton>
          
          <ToolbarButton
            onClick={() => {
              if (!editor) {
                return;
              }
              handleHeadingCycle();
            }}
            isActive={activeStates.headingLevel > 0}
            title={`heading (${activeStates.headingLevel > 0 ? `H${activeStates.headingLevel}` : 'Normal'})`}
            ariaLabel={`Toggle heading (${activeStates.headingLevel > 0 ? `H${activeStates.headingLevel}` : 'Normal'})`}
          >
            <Icon name="heading" size={20} style={{ fill: 'currentColor' }} />
          </ToolbarButton>
          
          <ToolbarButton
            onClick={() => {
              if (!editor) {
                return;
              }
              editor.chain().focus().toggleOrderedList().run();
            }}
            isActive={activeStates.orderedList}
            title="list: ordered"
            ariaLabel="Toggle ordered list"
          >
            <Icon name="list-ol" size={20} style={{ fill: 'currentColor' }} />
          </ToolbarButton>
          
          <ToolbarButton
            onClick={() => {
              if (!editor) {
                return;
              }
              editor.chain().focus().toggleBulletList().run();
            }}
            isActive={activeStates.bulletList}
            title="list: bullet"
            ariaLabel="Toggle bullet list"
          >
            <Icon name="list" size={20} style={{ fill: 'currentColor' }} />
          </ToolbarButton>
          
          <ToolbarButton
            onClick={() => {
              if (!editor) {
                return;
              }
              editor.chain().focus().clearNodes().unsetAllMarks().run();
            }}
            isActive={false}
            title="clean"
            ariaLabel="Clear formatting"
          >
            <Icon name="eraser" size={20} style={{ fill: 'currentColor' }} />
          </ToolbarButton>
        </div>
      )}
    </div>
  );
};

export default TiptapEditor;
