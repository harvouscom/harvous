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
import { normalizeScriptureReference, detectScriptureReferences, type ScriptureReference } from '@/utils/scripture-detector';
import { safeNavigate } from '@/utils/safe-navigate';
import { shouldProcessDocument, getTextToProcess, resetTracker, cleanupTracker } from '@/utils/incremental-scripture-detection';
import { debug } from '@/utils/logger';
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
  onEditorInstanceReady?: (editor: any) => void; // Callback when editor instance is ready for direct access
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

// Helper function to find pill boundaries (start and end positions of a pill mark)
// Returns null if position is not inside a pill
function findPillBoundaries(doc: any, pos: number): { start: number; end: number } | null {
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
  
  // If start and end are the same, we're not inside a pill
  if (pillStart === pillEnd && pillStart === pos) {
    // Check if we're actually at a pill boundary
    try {
      const $pos = doc.resolve(pos);
      const marks = $pos.marks();
      const hasPill = marks.some((m: any) => m.type.name === 'scripturePill');
      if (!hasPill) {
        return null; // Not inside a pill
      }
    } catch (e) {
      return null;
    }
  }
  
  return { start: pillStart, end: pillEnd };
}

// Helper function to check if there's a hard break node at a given position
// Hard breaks should be preserved even if there's no text content after a mark
function hasHardBreakAfter(doc: any, pos: number): boolean {
  try {
    const nodeAtPos = doc.nodeAt(pos);
    if (nodeAtPos && nodeAtPos.type.name === 'hardBreak') {
      return true;
    }
    // Also check the next position
    if (pos < doc.content.size) {
      const nextNode = doc.nodeAt(pos + 1);
      if (nextNode && nextNode.type.name === 'hardBreak') {
        return true;
      }
    }
    return false;
  } catch (e) {
    return false;
  }
}

// Helper function to check if there's a newline/line break (whitespace that should be preserved) after a position
// This includes hard breaks, newline characters, or whitespace that represents line breaks
function hasLineBreakAfter(doc: any, pos: number, paragraphEnd: number): boolean {
  try {
    // First check for hard break nodes
    if (hasHardBreakAfter(doc, pos)) {
      return true;
    }
    
    // Check if there's whitespace that includes newlines after the position
    const textAfter = doc.textBetween(pos, Math.min(pos + 20, paragraphEnd - 1));
    if (textAfter && /\n|\r/.test(textAfter)) {
      return true;
    }
    
    return false;
  } catch (e) {
    return false;
  }
}

// Helper function to check if a position range is within a single paragraph
// Returns true if both from and to positions are in the same paragraph node
// Also ensures the 'to' position doesn't extend beyond the paragraph boundary
function isWithinSingleParagraph(doc: any, from: number, to: number): boolean {
  try {
    const $from = doc.resolve(from);
    const $to = doc.resolve(to);
    
    // Find the paragraph node for the 'from' position
    let fromParagraph: any = null;
    let fromParagraphStart = 0;
    let fromParagraphEnd = 0;
    for (let i = $from.depth; i > 0; i--) {
      const node = $from.node(i);
      if (node.type.name === 'paragraph') {
        fromParagraph = node;
        // Calculate the start and end positions of this paragraph
        const paragraphPos = $from.start(i);
        fromParagraphStart = paragraphPos + 1; // +1 to skip the paragraph node itself
        fromParagraphEnd = paragraphPos + node.nodeSize - 1; // -1 because end is exclusive
        break;
      }
    }
    
    // Find the paragraph node for the 'to' position
    let toParagraph: any = null;
    let toParagraphStart = 0;
    let toParagraphEnd = 0;
    for (let i = $to.depth; i > 0; i--) {
      const node = $to.node(i);
      if (node.type.name === 'paragraph') {
        toParagraph = node;
        // Calculate the start and end positions of this paragraph
        const paragraphPos = $to.start(i);
        toParagraphStart = paragraphPos + 1; // +1 to skip the paragraph node itself
        toParagraphEnd = paragraphPos + node.nodeSize - 1; // -1 because end is exclusive
        break;
      }
    }
    
    // If we couldn't find paragraphs, assume it's valid (might be in a different block type)
    if (!fromParagraph || !toParagraph) {
      return true;
    }
    
    // Check if they're the same paragraph node
    if (fromParagraph !== toParagraph) {
      return false;
    }
    
    // Additional check: ensure 'to' position doesn't extend beyond the paragraph boundary
    // The 'to' position should be within the paragraph's text content, not at the boundary
    // This prevents marks from affecting paragraph breaks
    if (to >= toParagraphEnd) {
      return false; // 'to' extends to or beyond paragraph boundary
    }
    
    // CRITICAL: Also check if 'to' is at the very end of the paragraph's text content
    // Marks ending at the last character of a paragraph can still affect paragraph breaks
    // Find the actual end of text content in this paragraph
    const paragraphStartPos = $to.start($to.depth);
    let paragraphTextEnd = paragraphStartPos + 1; // Start after paragraph node
    let pos = paragraphStartPos + 1;
    
    toParagraph.content.forEach((child: any) => {
      if (child.isText) {
        paragraphTextEnd = pos + child.text.length;
      }
      pos += child.nodeSize;
    });
    
    // If 'to' is at or very close to the end of paragraph text, reject it
    // This prevents marks from ending at paragraph boundaries
    if (to >= paragraphTextEnd) {
      return false; // 'to' is at the end of paragraph text
    }
    
    return true;
  } catch (e) {
    // If we can't resolve positions, assume it's valid to avoid breaking functionality
    return true;
  }
}

// Helper function to adjust a position to ensure it doesn't extend beyond paragraph boundaries
// Returns an adjusted position with 'to' moved back if it's at a paragraph boundary
// CRITICAL: Marks must NEVER end exactly at paragraph boundaries to prevent affecting paragraph breaks
function adjustPositionForParagraphBoundary(doc: any, from: number, to: number): { from: number; to: number } {
  try {
    if (to <= from) {
      return { from, to };
    }
    
    const $from = doc.resolve(from);
    const $to = doc.resolve(to);
    
    // Find the paragraph node for 'from'
    let fromParagraph: any = null;
    let fromParagraphStart = 0;
    for (let i = $from.depth; i > 0; i--) {
      const node = $from.node(i);
      if (node.type.name === 'paragraph') {
        fromParagraph = node;
        fromParagraphStart = $from.start(i);
        break;
      }
    }
    
    // Find the paragraph node for 'to'
    let toParagraph: any = null;
    let toParagraphStart = 0;
    for (let i = $to.depth; i > 0; i--) {
      const node = $to.node(i);
      if (node.type.name === 'paragraph') {
        toParagraph = node;
        toParagraphStart = $to.start(i);
        break;
      }
    }
    
    // If we're in different paragraphs, adjust to end in the fromParagraph
    if (fromParagraph && toParagraph && fromParagraph !== toParagraph) {
      // Find the end of text content in fromParagraph
      let paragraphTextEnd = fromParagraphStart + 1;
      let currentOffset = 0;
      
      fromParagraph.content.forEach((child: any) => {
        if (child.isText) {
          const childStart = fromParagraphStart + 1 + currentOffset;
          paragraphTextEnd = childStart + child.text.length;
        }
        currentOffset += child.nodeSize;
      });
      
      // Ensure we end BEFORE the paragraph boundary (not at it)
      const adjustedTo = Math.max(from, paragraphTextEnd);
      return { from, to: adjustedTo };
    }
    
    // If we're in the same paragraph, ensure 'to' doesn't extend to the paragraph boundary
    if (fromParagraph && toParagraph && fromParagraph === toParagraph) {
      // Walk through the paragraph content to find the actual end of text
      let paragraphTextEnd = fromParagraphStart + 1;
      let pos = fromParagraphStart + 1;
      
      fromParagraph.content.forEach((child: any) => {
        if (child.isText) {
          paragraphTextEnd = pos + child.text.length;
        }
        pos += child.nodeSize;
      });
      
      // CRITICAL: Ensure 'to' ends BEFORE the paragraph boundary
      // If 'to' equals or exceeds paragraphTextEnd, it's at or beyond the boundary
      // We must end it strictly before the boundary to prevent affecting paragraph breaks
      if (to >= paragraphTextEnd) {
        // Move back to end of the last text character (paragraphTextEnd is already the end position)
        // But we want to ensure we're not at the boundary, so if to == paragraphTextEnd, move back by 1
        const adjustedTo = to > paragraphTextEnd ? paragraphTextEnd : Math.max(from, paragraphTextEnd);
        // Double-check: if adjustedTo is still at boundary, move back one more
        if (adjustedTo >= paragraphTextEnd && adjustedTo > from) {
          return { from, to: adjustedTo - 1 };
        }
        return { from, to: adjustedTo };
      }
    }
    
    // Check if 'to' is at the start of a new block (next paragraph)
    if ($to.depth === 1 && $to.parentOffset === 0) {
      // We're at the start of a new block - move 'to' back
      const adjustedTo = Math.max(from, to - 1);
      return { from, to: adjustedTo };
    }
    
    return { from, to };
  } catch (e) {
    // If we can't resolve positions, return original
    return { from, to };
  }
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
        let candidateFrom = map.docStart + offset;
        let candidateTo = candidateFrom + matchLength;
        
        // Verify the end position is correct by checking what's actually at that position
        // and ensuring we don't cross paragraph boundaries
        try {
          const $from = doc.resolve(candidateFrom);
          const $to = doc.resolve(candidateTo);
          
          // Check if we're crossing paragraph boundaries
          let fromParagraph: any = null;
          let toParagraph: any = null;
          
          for (let i = $from.depth; i > 0; i--) {
            const node = $from.node(i);
            if (node.type.name === 'paragraph') {
              fromParagraph = node;
              break;
            }
          }
          
          for (let i = $to.depth; i > 0; i--) {
            const node = $to.node(i);
            if (node.type.name === 'paragraph') {
              toParagraph = node;
              break;
            }
          }
          
          // If we're crossing paragraph boundaries, adjust candidateTo to end at paragraph boundary
          if (fromParagraph && toParagraph && fromParagraph !== toParagraph) {
            // Find the end of the fromParagraph's text content
            const paragraphStart = $from.start($from.depth);
            let paragraphTextEnd = paragraphStart + 1;
            let currentOffset = 0;
            
            fromParagraph.content.forEach((child: any) => {
              if (child.isText) {
                const childStart = paragraphStart + 1 + currentOffset;
                paragraphTextEnd = childStart + child.text.length;
              }
              currentOffset += child.nodeSize;
            });
            
            // Adjust candidateTo to be at the end of the paragraph's text, not beyond
            candidateTo = Math.min(candidateTo, paragraphTextEnd);
            
            // If the adjusted position is before candidateFrom, skip this match
            if (candidateTo <= candidateFrom) {
              break;
            }
          }
        } catch (e) {
          // If we can't resolve, skip this position to be safe
          break;
        }
        
        // Check if this position already has a scripture pill mark or overlaps with existing pills
        if (skipMarked) {
          try {
            // Check multiple positions within the match to catch pills that might span part of it
            let hasPill = false;
            const checkPositions = [
              candidateFrom,
              candidateFrom + Math.floor((candidateTo - candidateFrom) / 2),
              candidateTo - 1
            ];
            
            for (const checkPos of checkPositions) {
              try {
                const $check = doc.resolve(checkPos);
                const marks = $check.marks();
                if (marks.some((m: any) => m.type.name === 'scripturePill')) {
                  hasPill = true;
                  break;
                }
              } catch (e) {
                // If we can't resolve, continue checking other positions
              }
            }
            
            if (hasPill) {
              // Skip this position - it's already inside a pill
              continue;
            }
            
            // Also check if this position overlaps with any existing pill boundaries
            // by checking positions just before and after the match
            const checkBefore = Math.max(0, candidateFrom - 1);
            const checkAfter = Math.min(doc.content.size, candidateTo + 1);
            
            try {
              const $before = doc.resolve(checkBefore);
              const $after = doc.resolve(checkAfter);
              const marksBefore = $before.marks();
              const marksAfter = $after.marks();
              
              // If positions immediately before or after have pills, this might overlap
              if (marksBefore.some((m: any) => m.type.name === 'scripturePill') ||
                  marksAfter.some((m: any) => m.type.name === 'scripturePill')) {
                // Check if the pill extends into our match area
                // If so, skip to avoid overlapping pills
                continue;
              }
            } catch (e) {
              // If we can't check, continue anyway
            }
          } catch (e) {
            // If we can't resolve, skip it
            continue;
          }
        }
        
        // Validate that this position doesn't span across paragraph boundaries
        // This prevents marks from affecting paragraph breaks
        try {
          if (!isWithinSingleParagraph(doc, candidateFrom, candidateTo)) {
            // Skip positions that span paragraphs
            break;
          }
        } catch (e) {
          // If we can't validate, skip this position to be safe
          break;
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
      // Dispatch noteCreated event so OrganizedContentList can refresh
      // This ensures the scripture note appears in the scripture tab immediately
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('noteCreated', {
          detail: { 
            note: result.note,
            actualThreadId: targetThreadId
          }
        }));
      }
      
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
// Helper function to create pending pills for detected scripture references
// Helper function to create pending pills for detected scripture references
// This is called after space key press to show visual feedback
function createPendingPillsForReferences(editor: any, references: ScriptureReference[]) {
  if (!editor || !references || references.length === 0) {
    return;
  }
  
  try {
    const view = editor.view;
    let state = view.state;
    let tr = state.tr;
    let modified = false;
    
    // Save the current cursor position
    const originalCursorPos = state.selection.from;
    
    for (const ref of references) {
      const reference = ref.reference;
      if (!reference) continue;
      
      const doc = tr.doc;
      const positions = findAllTextPositions(doc, reference, true);
      
      for (let i = positions.length - 1; i >= 0; i--) {
        const pos = positions[i];
        
        try {
          const $from = doc.resolve(pos.from);
          const hasPill = $from.marks().some((m: any) => m.type.name === 'scripturePill');
          
          if (hasPill) continue;
          
          if (!isWithinSingleParagraph(doc, pos.from, pos.to)) continue;
          const adjustedPos = adjustPositionForParagraphBoundary(doc, pos.from, pos.to);
          if (!isWithinSingleParagraph(doc, adjustedPos.from, adjustedPos.to)) continue;
          
          const markType = state.schema.marks.scripturePill;
          if (markType) {
            tr.addMark(adjustedPos.from, adjustedPos.to, markType.create({ 
              reference: reference, 
              noteId: 'pending' 
            }));
            modified = true;
          }
        } catch (e) {
          continue;
        }
      }
    }
    
    if (modified) {
      tr.setMeta('addToHistory', false);
      view.dispatch(tr);
      
      // Update our local state reference after dispatch
      state = view.state;
    }
    
    // Position cursor and clear marks
    setTimeout(() => {
      if (!editor || editor.isDestroyed) return;
      
      const doc = editor.state.doc;
      const currentPos = editor.state.selection.from;
      let pillEndPos = currentPos;
      let foundPill = false;
      
      for (let checkPos = Math.max(0, currentPos - 5); checkPos <= Math.min(currentPos + 2, doc.content.size); checkPos++) {
        try {
          const $check = doc.resolve(checkPos);
          if ($check.marks().some((m: any) => m.type.name === 'scripturePill')) {
            foundPill = true;
            for (let p = checkPos; p <= doc.content.size; p++) {
              const $p = doc.resolve(p);
              if (!$p.marks().some((m: any) => m.type.name === 'scripturePill')) {
                pillEndPos = Math.max(pillEndPos, p);
                break;
              }
            }
          }
        } catch (e) {}
      }
      
      if (foundPill || true) { // Always clear marks after pill creation attempt
        const targetPos = Math.max(pillEndPos, currentPos);
        editor.chain()
          .setTextSelection(targetPos)
          .unsetMark('scripturePill')
          .focus()
          .run();
      }
    }, 10);
    
  } catch (error) {
    console.error('Error creating pending pills:', error);
  }
}

export async function convertScriptureReferencesToPills(
  editor: any, 
  scriptureResults: Array<{ reference: string; noteId: string }>
) {
  if (!editor) {
    return;
  }
  
  try {
    // Get fresh document state after content was set
    const doc = editor.state.doc;
    
    // If no results, remove all pending pills (they weren't validated)
    if (!scriptureResults || scriptureResults.length === 0) {
      // Remove all pending pills
      const pendingPills: Array<{from: number, to: number}> = [];
      
      doc.descendants((node: any, pos: number) => {
        if (node.marks) {
          const pillMark = node.marks.find((m: any) => m.type.name === 'scripturePill');
          if (pillMark && pillMark.attrs.noteId === 'pending') {
            pendingPills.push({
              from: pos,
              to: pos + node.nodeSize
            });
          }
        }
      });
      
      // Remove invalid pending pills
      for (let i = pendingPills.length - 1; i >= 0; i--) {
        const pill = pendingPills[i];
        const tr = editor.state.tr;
        tr.removeMark(pill.from, pill.to, editor.state.schema.marks.scripturePill);
        editor.view.dispatch(tr);
      }
      return;
    }
    
    const validReferences = new Set(scriptureResults.map(r => normalizeScriptureReference(r.reference)));
    
    // Step 1: Remove pending pills that weren't validated by server
    const pendingPillsToRemove: Array<{from: number, to: number, reference: string}> = [];
    
    doc.descendants((node: any, pos: number) => {
      if (node.marks) {
        const pillMark = node.marks.find((m: any) => m.type.name === 'scripturePill');
        if (pillMark && pillMark.attrs.noteId === 'pending') {
          const normalizedRef = normalizeScriptureReference(pillMark.attrs.reference);
          if (!validReferences.has(normalizedRef)) {
            // This pending pill wasn't validated - mark for removal
            pendingPillsToRemove.push({
              from: pos,
              to: pos + node.nodeSize,
              reference: pillMark.attrs.reference
            });
          }
        }
      }
    });
    
    // Remove invalid pending pills
    for (let i = pendingPillsToRemove.length - 1; i >= 0; i--) {
      const pill = pendingPillsToRemove[i];
      const tr = editor.state.tr;
      tr.removeMark(pill.from, pill.to, editor.state.schema.marks.scripturePill);
      editor.view.dispatch(tr);
    }
    
    // Step 2: Update pending pills with real noteIds or create new pills
    for (const result of scriptureResults) {
      const { reference, noteId } = result;
      if (!reference || !noteId) {
        continue;
      }

      const normalizedRef = normalizeScriptureReference(reference);
      
      // Find all positions of this reference in the document (don't skip marked - we need to update pending ones)
      const positions = findAllTextPositions(doc, reference, false);
      
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
          const pillMark = marks.find((m: any) => m.type.name === 'scripturePill');
          
          if (pillMark) {
            // Already has a pill - check if it's pending and needs updating
            if (pillMark.attrs.noteId === 'pending') {
              // Update pending pill with real noteId
              const tr = editor.state.tr;
              tr.removeMark(pos.from, pos.to, editor.state.schema.marks.scripturePill);
              tr.addMark(pos.from, pos.to, editor.state.schema.marks.scripturePill.create({
                reference: normalizedRef,
                noteId: noteId
              }));
              editor.view.dispatch(tr);
            }
            // If it already has a real noteId, skip it
            continue;
          }
          
          // Validate that the position doesn't span across paragraph boundaries
          // This prevents line breaks from being lost when scripture pills are created
          if (!isWithinSingleParagraph(doc, pos.from, pos.to)) {
            // Skip this position if it spans across paragraphs
            // This ensures paragraph breaks are preserved
            continue;
          }
          
          // Adjust position to ensure it doesn't extend beyond paragraph boundaries
          // This prevents marks from affecting paragraph breaks
          const adjustedPos = adjustPositionForParagraphBoundary(doc, pos.from, pos.to);
          
          // Validate again after adjustment
          if (!isWithinSingleParagraph(doc, adjustedPos.from, adjustedPos.to)) {
            continue;
          }
          
          // CRITICAL: Verify the text at this position actually matches the reference
          // This ensures we're not applying marks to text that spans paragraphs
          // Also ensure we don't include trailing whitespace/newlines in the mark
          try {
            let textAtPosition = doc.textBetween(adjustedPos.from, adjustedPos.to);
            // Remove trailing whitespace/newlines from the text before matching
            // This ensures marks don't consume line breaks
            const trimmedText = textAtPosition.trimEnd();
            const normalizedPositionText = normalizeScriptureReference(trimmedText);
            const normalizedSearchRef = normalizeScriptureReference(reference);
            
            // If the text doesn't match (might include paragraph breaks), skip it
            if (normalizedPositionText !== normalizedSearchRef) {
              continue;
            }
            
            // If there's trailing whitespace/newline, adjust the 'to' position to exclude it
            // This prevents the mark from consuming the line break
            if (textAtPosition !== trimmedText) {
              const trailingWhitespaceLength = textAtPosition.length - trimmedText.length;
              adjustedPos.to = adjustedPos.to - trailingWhitespaceLength;
              // Validate the adjusted position is still valid
              if (adjustedPos.to <= adjustedPos.from) {
                continue;
              }
            }
          } catch (e) {
            // If we can't verify, skip to be safe
            continue;
          }
          
          // CRITICAL: Check if there's content after the mark in the same paragraph
          // If the mark ends at the end of the paragraph, skip it to prevent affecting paragraph breaks
          // But allow marks that end before hard breaks (<br>) - these should be preserved
          try {
            const $to = doc.resolve(adjustedPos.to);
            const paragraphStart = $to.start($to.depth);
            const paragraphEnd = paragraphStart + $to.node($to.depth).nodeSize;
            
            // Check if there's any content after the mark in this paragraph
            if (adjustedPos.to >= paragraphEnd - 1) {
              // Mark ends at or very close to paragraph end - skip it
              continue;
            }
            
            // Check if there's a line break (hard break or newline) right after the mark (these should be preserved)
            if (hasLineBreakAfter(doc, adjustedPos.to, paragraphEnd)) {
              // There's a line break after the mark - this is fine, allow it
              // The line break will be preserved
            } else {
              // Check if there's actual text content after the mark
              const textAfterMark = doc.textBetween(adjustedPos.to, Math.min(adjustedPos.to + 10, paragraphEnd - 1));
              // If there's no text after the mark (or only whitespace), and we're near the paragraph end, skip
              if (!textAfterMark.trim() && adjustedPos.to >= paragraphEnd - 5) {
                continue;
              }
            }
          } catch (e) {
            // If we can't check, skip to be safe
            continue;
          }
          
          // Apply scripture pill mark using transaction API directly to avoid selection issues
          try {
            const tr = editor.state.tr;
            const markType = editor.state.schema.marks.scripturePill;
            if (markType) {
              tr.addMark(adjustedPos.from, adjustedPos.to, markType.create({ reference: normalizedRef, noteId }));
              // Remove noteLink mark if present
              const noteLinkMark = editor.state.schema.marks.noteLink;
              if (noteLinkMark) {
                tr.removeMark(adjustedPos.from, adjustedPos.to, noteLinkMark);
              }
              editor.view.dispatch(tr);
            }
          } catch (e) {
            // If transaction fails, fall back to chain API
            editor.chain()
              .setTextSelection(adjustedPos)
              .unsetMark('noteLink')
              .setMark('scripturePill', { reference: normalizedRef, noteId })
              .run();
          }
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
          
          // Validate that the position doesn't span across paragraph boundaries
          // This prevents line breaks from being lost when scripture pills are created
          if (!isWithinSingleParagraph(doc, pos.from, pos.to)) {
            // Skip this position if it spans across paragraphs
            // This ensures paragraph breaks are preserved
            continue;
          }
          
          // Adjust position to ensure it doesn't extend beyond paragraph boundaries
          // This prevents marks from affecting paragraph breaks
          const adjustedPos = adjustPositionForParagraphBoundary(doc, pos.from, pos.to);
          
          // Validate again after adjustment
          if (!isWithinSingleParagraph(doc, adjustedPos.from, adjustedPos.to)) {
            continue;
          }
          
          // CRITICAL: Verify the text at this position actually matches the reference
          // This ensures we're not applying marks to text that spans paragraphs
          // Also ensure we don't include trailing whitespace/newlines in the mark
          try {
            let textAtPosition = doc.textBetween(adjustedPos.from, adjustedPos.to);
            // Remove trailing whitespace/newlines from the text before matching
            // This ensures marks don't consume line breaks
            const trimmedText = textAtPosition.trimEnd();
            const normalizedPositionText = normalizeScriptureReference(trimmedText);
            const normalizedSearchRef = normalizeScriptureReference(reference);
            
            // If the text doesn't match (might include paragraph breaks), skip it
            if (normalizedPositionText !== normalizedSearchRef) {
              continue;
            }
            
            // If there's trailing whitespace/newline, adjust the 'to' position to exclude it
            // This prevents the mark from consuming the line break
            if (textAtPosition !== trimmedText) {
              const trailingWhitespaceLength = textAtPosition.length - trimmedText.length;
              adjustedPos.to = adjustedPos.to - trailingWhitespaceLength;
              // Validate the adjusted position is still valid
              if (adjustedPos.to <= adjustedPos.from) {
                continue;
              }
            }
          } catch (e) {
            // If we can't verify, skip to be safe
            continue;
          }
          
          // CRITICAL: Check if there's content after the mark in the same paragraph
          // If the mark ends at the end of the paragraph, skip it to prevent affecting paragraph breaks
          // But allow marks that end before hard breaks (<br>) - these should be preserved
          try {
            const $to = doc.resolve(adjustedPos.to);
            const paragraphStart = $to.start($to.depth);
            const paragraphEnd = paragraphStart + $to.node($to.depth).nodeSize;
            
            // Check if there's any content after the mark in this paragraph
            if (adjustedPos.to >= paragraphEnd - 1) {
              // Mark ends at or very close to paragraph end - skip it
              continue;
            }
            
            // Check if there's a line break (hard break or newline) right after the mark (these should be preserved)
            if (hasLineBreakAfter(doc, adjustedPos.to, paragraphEnd)) {
              // There's a line break after the mark - this is fine, allow it
              // The line break will be preserved
            } else {
              // Check if there's actual text content after the mark
              const textAfterMark = doc.textBetween(adjustedPos.to, Math.min(adjustedPos.to + 10, paragraphEnd - 1));
              // If there's no text after the mark (or only whitespace), and we're near the paragraph end, skip
              if (!textAfterMark.trim() && adjustedPos.to >= paragraphEnd - 5) {
                continue;
              }
            }
          } catch (e) {
            // If we can't check, skip to be safe
            continue;
          }
          
          // Apply scripture pill mark using transaction API directly to avoid selection issues
          try {
            const tr = editor.state.tr;
            const markType = editor.state.schema.marks.scripturePill;
            if (markType) {
              tr.addMark(adjustedPos.from, adjustedPos.to, markType.create({ reference: normalizedRef, noteId }));
              // Remove noteLink mark if present
              const noteLinkMark = editor.state.schema.marks.noteLink;
              if (noteLinkMark) {
                tr.removeMark(adjustedPos.from, adjustedPos.to, noteLinkMark);
              }
              editor.view.dispatch(tr);
            }
          } catch (e) {
            // If transaction fails, fall back to chain API
            editor.chain()
              .setTextSelection(adjustedPos)
              .unsetMark('noteLink')
              .setMark('scripturePill', { reference: normalizedRef, noteId })
              .run();
          }
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
      // Skip if no noteId or if it's a pending pill (not yet saved)
      if (!noteId || noteId === 'pending') continue;
      
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
                  
                  // Validate that the position doesn't span across paragraph boundaries
                  // This prevents line breaks from being lost when scripture pills are created
                  if (!isWithinSingleParagraph(doc, pos.from, pos.to)) {
                    // Skip this position if it spans across paragraphs
                    // This ensures paragraph breaks are preserved
                    continue;
                  }
                  
                  // Adjust position to ensure it doesn't extend beyond paragraph boundaries
                  // This prevents marks from affecting paragraph breaks
                  const adjustedPos = adjustPositionForParagraphBoundary(doc, pos.from, pos.to);
                  
                  // Validate again after adjustment
                  if (!isWithinSingleParagraph(doc, adjustedPos.from, adjustedPos.to)) {
                    continue;
                  }
                  
                  // CRITICAL: Verify the text at this position actually matches the linkText
                  // This ensures we're not applying marks to text that spans paragraphs
                  try {
                    const textAtPosition = doc.textBetween(adjustedPos.from, adjustedPos.to);
                    const normalizedPositionText = normalizeScriptureReference(textAtPosition.trim());
                    const normalizedLinkText = normalizeScriptureReference(linkText.trim());
                    
                    // If the text doesn't match (might include paragraph breaks), skip it
                    if (normalizedPositionText !== normalizedLinkText) {
                      continue;
                    }
                  } catch (e) {
                    // If we can't verify, skip to be safe
                    continue;
                  }
                  
                  // CRITICAL: Check if there's text after the mark in the same paragraph
                  // If the mark ends at the end of the paragraph, skip it to prevent affecting paragraph breaks
                  try {
                    const $to = doc.resolve(adjustedPos.to);
                    const paragraphStart = $to.start($to.depth);
                    const paragraphEnd = paragraphStart + $to.node($to.depth).nodeSize;
                    
                    // Check if there's any text content after the mark in this paragraph
                    if (adjustedPos.to >= paragraphEnd - 1) {
                      // Mark ends at or very close to paragraph end - skip it
                      continue;
                    }
                    
                    // Check if there's actual text content after the mark
                    const textAfterMark = doc.textBetween(adjustedPos.to, Math.min(adjustedPos.to + 10, paragraphEnd - 1));
                    // If there's no text after the mark (or only whitespace), and we're near the paragraph end, skip
                    if (!textAfterMark.trim() && adjustedPos.to >= paragraphEnd - 5) {
                      continue;
                    }
                  } catch (e) {
                    // If we can't check, skip to be safe
                    continue;
                  }
                  
                  // Apply scripture pill mark using transaction API directly to avoid selection issues
                  try {
                    const tr = editor.state.tr;
                    const markType = editor.state.schema.marks.scripturePill;
                    if (markType) {
                      tr.addMark(adjustedPos.from, adjustedPos.to, markType.create({ reference: normalizedRef, noteId }));
                      // Remove noteLink mark if present
                      const noteLinkMark = editor.state.schema.marks.noteLink;
                      if (noteLinkMark) {
                        tr.removeMark(adjustedPos.from, adjustedPos.to, noteLinkMark);
                      }
                      editor.view.dispatch(tr);
                    }
                  } catch (e) {
                    // If transaction fails, fall back to chain API
                    editor.chain()
                      .setTextSelection(adjustedPos)
                      .unsetMark('noteLink')
                      .setMark('scripturePill', { reference: normalizedRef, noteId })
                      .run();
                  }
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
async function detectAndCreateScriptureNotes(editor: any, parentThreadId?: string, editorId?: string, isDetectingRef?: React.MutableRefObject<boolean>) {
  
  if (!editor) {
    return;
  }
  
  // Mark as detecting to prevent concurrent detections
  if (isDetectingRef) {
    isDetectingRef.current = true;
  }

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
    
    // Track if any pills were created in this detection cycle
    let pillsCreated = false;

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
      
      // For real-time detection, create pills WITHOUT creating scripture notes
      // Notes will be created when the note is saved
      // Set noteId to null/undefined to indicate pending state
      const noteId = null; // Defer note creation until save
      
      debug('[TiptapEditor] Creating pill without noteId (deferred)', {
        reference: normalizedRef,
        positionsCount: allPositions.length
      });
      
      // Helper function to validate reference context before creating pill
      // This is a conservative check - only rejects clear false positives
      // The main validation happens in scripture-detector.ts, this is a secondary check
      const validateReferenceContext = (doc: any, from: number, to: number, refText: string): boolean => {
        try {
          // Get text around the reference position
          const fullText = doc.textContent;
          const textBefore = fullText.substring(Math.max(0, from - 30), from).trim();
          const textAfter = fullText.substring(to, Math.min(to + 30, fullText.length)).trim();
          
          // Only check for very clear false positives
          // Pattern like "John 3 years ago" - check for number + time word + "ago"
          const falsePositivePattern = /^\s*(years?|months?|days?|dollars?|people|times?|hours?|minutes?|seconds?|weeks?)\s+(ago|later|before|after)\b/i;
          if (falsePositivePattern.test(textAfter)) {
            // Check if reference is chapter-only (no colon) - more likely to be false positive
            if (!refText.includes(':')) {
              return false; // Likely false positive like "John 3 years ago"
            }
          }
          
          // Check for "Book Number" followed immediately by time/quantity words (no space)
          // This catches cases where regex matched but it's actually part of a phrase
          const immediateFalsePositive = /^(years?|months?|days?|dollars?|people)\b/i;
          if (immediateFalsePositive.test(textAfter) && !refText.includes(':')) {
            // Chapter-only reference followed by quantity word - likely false positive
            return false;
          }
          
          // Default: allow the reference (be permissive - main validation is in scripture-detector.ts)
          return true;
        } catch (e) {
          // If we can't validate, allow it (safer to allow than block)
          return true;
        }
      };
      
      // Process each occurrence
      // Note: We process in reverse order (from end to start) to avoid position shifts
      // when marks are applied, since applying a mark doesn't change document size
      // but we'll still process in order for safety
      for (let i = allPositions.length - 1; i >= 0; i--) {
        const positions = allPositions[i];
        
        // Get fresh document state after previous mark applications
        const currentDoc = editor.state.doc;
        
        // Validate reference context before creating pill
        if (!validateReferenceContext(currentDoc, positions.from, positions.to, reference)) {
          // Skip this position - it's not in a valid scripture context
          continue;
        }
        
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
        
        // Validate that the position doesn't span across paragraph boundaries
        // This prevents line breaks from being lost when scripture pills are created
        if (!isWithinSingleParagraph(currentDoc, positions.from, positions.to)) {
          // Skip this position if it spans across paragraphs
          // This ensures paragraph breaks are preserved
          continue;
        }
        
        // Adjust position to ensure it doesn't extend beyond paragraph boundaries
        // This prevents marks from affecting paragraph breaks
        const adjustedPos = adjustPositionForParagraphBoundary(currentDoc, positions.from, positions.to);
        
        // Validate again after adjustment
        if (!isWithinSingleParagraph(currentDoc, adjustedPos.from, adjustedPos.to)) {
          continue;
        }
        
        // CRITICAL: Verify the text at this position actually matches the reference
        // This ensures we're not applying marks to text that spans paragraphs
        try {
          const textAtPosition = currentDoc.textBetween(adjustedPos.from, adjustedPos.to);
          const normalizedPositionText = normalizeScriptureReference(textAtPosition.trim());
          const normalizedSearchRef = normalizeScriptureReference(reference);
          
          // If the text doesn't match (might include paragraph breaks), skip it
          if (normalizedPositionText !== normalizedSearchRef) {
            continue;
          }
        } catch (e) {
          // If we can't verify, skip to be safe
          continue;
        }
        
        // CRITICAL: Check if there's content after the mark in the same paragraph
        // If the mark ends at the end of the paragraph, skip it to prevent affecting paragraph breaks
        // But allow marks that end before hard breaks (<br>) - these should be preserved
        try {
          const $to = currentDoc.resolve(adjustedPos.to);
          const paragraphStart = $to.start($to.depth);
          const paragraphEnd = paragraphStart + $to.node($to.depth).nodeSize;
          
          // Check if there's any content after the mark in this paragraph
          if (adjustedPos.to >= paragraphEnd - 1) {
            // Mark ends at or very close to paragraph end - skip it
            continue;
          }
          
          // Check if there's a hard break right after the mark (these should be preserved)
          if (hasHardBreakAfter(currentDoc, adjustedPos.to)) {
            // There's a hard break after the mark - this is fine, allow it
            // The hard break will be preserved
          } else {
            // Check if there's actual text content after the mark
            const textAfterMark = currentDoc.textBetween(adjustedPos.to, Math.min(adjustedPos.to + 10, paragraphEnd - 1));
            // If there's no text after the mark (or only whitespace), and we're near the paragraph end, skip
            if (!textAfterMark.trim() && adjustedPos.to >= paragraphEnd - 5) {
              continue;
            }
          }
        } catch (e) {
          // If we can't check, skip to be safe
          continue;
        }
        
        // Apply scripture pill mark using transaction API directly to avoid selection issues
        // Note: noteId is null for real-time pills (will be set on save)
        try {
          const tr = editor.state.tr;
          const markType = editor.state.schema.marks.scripturePill;
          if (markType) {
            tr.addMark(adjustedPos.from, adjustedPos.to, markType.create({ reference: normalizedRef, noteId: noteId || undefined }));
            // Remove noteLink mark if present
            const noteLinkMark = editor.state.schema.marks.noteLink;
            if (noteLinkMark) {
              tr.removeMark(adjustedPos.from, adjustedPos.to, noteLinkMark);
            }
            editor.view.dispatch(tr);
            pillsCreated = true; // Track that we created a pill
            
            debug('[TiptapEditor] Pill mark applied', {
              reference: normalizedRef,
              from: adjustedPos.from,
              to: adjustedPos.to,
              noteId: noteId || 'pending'
            });
          }
        } catch (e) {
          // If transaction fails, fall back to chain API
          editor.chain()
            .setTextSelection(adjustedPos)
            .unsetMark('noteLink')
            .setMark('scripturePill', { reference: normalizedRef, noteId: noteId || undefined })
            .run();
          pillsCreated = true; // Track that we created a pill
          
          debug('[TiptapEditor] Pill mark applied via chain API', {
            reference: normalizedRef,
            from: adjustedPos.from,
            to: adjustedPos.to,
            noteId: noteId || 'pending'
          });
        }
      }
    }
    
    // Restore cursor position after all pills are created
    // Check if cursor is inside a pill and move it after if needed
      debug('[TiptapEditor] Starting cursor positioning after pill creation', {
        currentCursorPos,
        docSize: editor.state.doc.content.size
      });
    
    try {
      const doc = editor.state.doc;
      const $current = doc.resolve(currentCursorPos);
      const currentMarks = $current.marks();
      const isInsidePill = currentMarks.some((m: any) => m.type.name === 'scripturePill');
      
      debug('[TiptapEditor] Cursor position check', {
        currentCursorPos,
        isInsidePill,
        marks: currentMarks.map((m: any) => m.type.name),
        editorFocused: editor.isFocused
      });
      
      if (isInsidePill) {
        // Find pill boundaries and move cursor after it
        const boundaries = findPillBoundaries(doc, currentCursorPos);
        debug('[TiptapEditor] Pill boundaries found', {
          boundaries,
          currentCursorPos
        });
        
        if (boundaries) {
          // ProseMirror marks are inclusive at boundaries, so boundaries.end still has the pill mark
          // We need to find the first position AFTER the pill that doesn't have the mark
          let cursorPos = boundaries.end;
          const maxPos = doc.content.size;
          let foundPosition = false;
          
          debug('[TiptapEditor] Searching for safe position after pill', {
            startPos: boundaries.end,
            maxPos
          });
          
          // Find first position without pill mark (up to 10 positions ahead)
          for (let pos = boundaries.end; pos <= Math.min(boundaries.end + 10, maxPos); pos++) {
            try {
              const $pos = doc.resolve(pos);
              const marks = $pos.marks();
              const hasPill = marks.some((m: any) => m.type.name === 'scripturePill');
              if (!hasPill) {
                cursorPos = pos;
                foundPosition = true;
                debug('[TiptapEditor] Found safe position', { pos, marks: marks.map((m: any) => m.type.name) });
                break;
              }
            } catch (e) {
              // If we can't resolve, use this position
              cursorPos = pos;
              foundPosition = true;
              debug('[TiptapEditor] Using position after resolve error', { pos, error: e });
              break;
            }
          }
          
          // If we're at the end of document and still inside pill, use document end
          // The stored marks clearing will ensure typing works
          if (!foundPosition && boundaries.end >= maxPos - 1) {
            cursorPos = maxPos;
            debug('[TiptapEditor] Using document end as safe position', { cursorPos });
          }
          
          // Double-check the final cursor position doesn't have pill mark
          // If it does, move forward one more position
          // Keep checking until we find a position without the pill mark
          let attempts = 0;
          const maxAttempts = 20;
          while (attempts < maxAttempts && cursorPos < maxPos) {
            try {
              const $finalPos = doc.resolve(cursorPos);
              const finalMarks = $finalPos.marks();
              const finalHasPill = finalMarks.some((m: any) => m.type.name === 'scripturePill');
              if (!finalHasPill) {
                debug('[TiptapEditor] Verified safe position', { cursorPos, attempts });
                break; // Found a safe position
              }
              cursorPos = Math.min(cursorPos + 1, maxPos);
              attempts++;
            } catch (e) {
              // If we can't resolve, use this position
              debug('[TiptapEditor] Using position after verification error', { cursorPos, error: e });
              break;
            }
          }
          
          debug('[TiptapEditor] Setting cursor position', {
            cursorPos,
            attempts,
            editorFocused: editor.isFocused
          });
          
          // Use transaction to set cursor and clear stored marks in one operation
          const tr = editor.state.tr;
          tr.setSelection(TextSelection.create(tr.doc, cursorPos));
          tr.setStoredMarks([]);
          
          // CRITICAL: Ensure the editor is editable before dispatching
          // Check if editor is in a state that can accept input
          if (!editor.isEditable) {
            // Editor not editable - skip cursor positioning
            return;
          }
          
          editor.view.dispatch(tr);
          
          // CRITICAL: After dispatching transaction, ensure view is updated and can receive input
          // Force a view update to ensure ProseMirror processes the transaction
          // Use requestAnimationFrame to ensure DOM is ready
          requestAnimationFrame(() => {
            if (editor && !editor.isDestroyed && editor.view) {
              // Force view to update its state - this ensures ProseMirror processes the transaction
              try {
                // CRITICAL: Don't call updateState with the same state - this can cause issues
                // Instead, just ensure the view is ready for input
                // The view should already be updated by the dispatch above
                
                // Verify editor can still receive input
                const dom = editor.view.dom as HTMLElement;
                const contentEditable = dom.querySelector('[contenteditable="true"]') as HTMLElement;
                const targetElement = contentEditable || dom;
                
                const isEditable = targetElement.contentEditable === 'true';
                const isDisabled = (targetElement as any).disabled;
                const isReadOnly = (targetElement as any).readOnly;
                
                // If editor is not editable, this is a critical issue
                if (!isEditable || isDisabled || isReadOnly) {
                  console.error('[TiptapEditor] CRITICAL: Editor cannot receive input after transaction!', {
                    isEditable,
                    isDisabled,
                    isReadOnly,
                    contentEditable: targetElement.contentEditable
                  });
                  
                  // Try to force it to be editable
                  if (targetElement.contentEditable !== 'true') {
                    targetElement.contentEditable = 'true';
                  }
                }
                
                // CRITICAL: Ensure the view is ready to receive input by focusing it
                // This might be needed if the transaction somehow disrupted focus handling
                setTimeout(() => {
                  if (editor && !editor.isDestroyed && editor.view) {
                    const dom = editor.view.dom as HTMLElement;
                    const contentEditable = dom.querySelector('[contenteditable="true"]') as HTMLElement;
                    const targetElement = contentEditable || dom;
                    
                    // Force focus one more time
                    targetElement.focus({ preventScroll: true });
                    editor.commands.focus();
                    
                    // Verify focus
                    const isFocused = document.activeElement === targetElement || 
                                     document.activeElement === dom ||
                                     editor.isFocused;
                    
                  }
                }, 0);
              } catch (e) {
                console.error('[TiptapEditor] Error in post-transaction update', e);
              }
            }
          });
          
          // CRITICAL: Reset isDetecting flag immediately after cursor positioning
          // This ensures typing can continue right away, even before the setTimeout
          if (isDetectingRef) {
            isDetectingRef.current = false;
          }
          
          // Double-check stored marks are actually cleared
          const storedMarksAfter = editor.state.storedMarks || [];
          if (storedMarksAfter.length > 0) {
            // Force clear them again
            const clearTr = editor.state.tr.setStoredMarks([]);
            editor.view.dispatch(clearTr);
          }
          
          // Immediately try to focus after transaction (before setTimeout)
          // This helps in form contexts where focus might be stolen
          try {
            if (editor.view && editor.view.dom) {
              const dom = editor.view.dom as HTMLElement;
              
              // Force focus with multiple methods for form contexts
              dom.focus({ preventScroll: true });
              editor.commands.focus();
              
              // Also try focusing the contentEditable element directly if it exists
              const contentEditable = dom.querySelector('[contenteditable="true"]') as HTMLElement;
              if (contentEditable) {
                contentEditable.focus({ preventScroll: true });
              }
              
              // Verify focus and check if element can receive input
              const isFocused = document.activeElement === dom || document.activeElement === contentEditable;
              const canReceiveInput = dom.contentEditable === 'true' || contentEditable?.contentEditable === 'true';
              
              // If still not focused, try one more time after a microtask
              if (!isFocused) {
                Promise.resolve().then(() => {
                  if (editor && !editor.isDestroyed && editor.view && editor.view.dom) {
                    const dom = editor.view.dom as HTMLElement;
                    dom.focus({ preventScroll: true });
                    editor.commands.focus();
                  }
                });
              }
            }
          } catch (e) {
            console.error('[TiptapEditor] Error in immediate focus', e);
          }
          
          // Verify cursor position after transaction - if still inside pill, move it again
          // Also ensure stored marks are cleared
          setTimeout(() => {
            try {
              if (!editor || editor.isDestroyed) {
                debug('[TiptapEditor] Editor destroyed during verification, skipping');
                return;
              }
              if (!editor.view || !editor.view.docView) {
                debug('[TiptapEditor] Editor view invalid during verification, skipping');
                return;
              }
              
              // Get fresh state after transaction
              const freshState = editor.state;
              const currentSelection = freshState.selection;
              const currentPos = currentSelection.anchor;
              const $current = freshState.doc.resolve(currentPos);
              const currentMarks = $current.marks();
              const stillInsidePill = currentMarks.some((m: any) => m.type.name === 'scripturePill');
              
              debug('[TiptapEditor] Verifying cursor position after transaction', {
                currentPos,
                stillInsidePill,
                marks: currentMarks.map((m: any) => m.type.name),
                storedMarks: freshState.storedMarks?.map((m: any) => m.type.name) || [],
                editorFocused: editor.isFocused
              });
              
              if (stillInsidePill) {
                debug('[TiptapEditor] Cursor still inside pill, repositioning', { currentPos });
                // Still inside pill - find a safe position after it
                const safeBoundaries = findPillBoundaries(freshState.doc, currentPos);
                debug('[TiptapEditor] Safe boundaries for repositioning', { safeBoundaries, currentPos });
                
                if (safeBoundaries) {
                  let safePos = safeBoundaries.end;
                  const maxPos = freshState.doc.content.size;
                  
                  // Find first position without pill mark (check up to 20 positions)
                  for (let pos = safeBoundaries.end; pos <= Math.min(safeBoundaries.end + 20, maxPos); pos++) {
                    try {
                      const $pos = freshState.doc.resolve(pos);
                      const marks = $pos.marks();
                      const hasPill = marks.some((m: any) => m.type.name === 'scripturePill');
                      if (!hasPill) {
                        safePos = pos;
                        debug('[TiptapEditor] Found safe position in verification', { safePos, pos });
                        break;
                      }
                    } catch (e) {
                      safePos = pos;
                      debug('[TiptapEditor] Using position after resolve error in verification', { safePos, pos, error: e });
                      break;
                    }
                  }
                  
                  // Check if there's a space after the safe position - if not, insert one
                  const textAfter = freshState.doc.textBetween(safePos, Math.min(safePos + 1, maxPos));
                  const needsSpace = textAfter !== ' ' && textAfter !== '\n';
                  
                  debug('[TiptapEditor] Space check for safe position', { safePos, textAfter, needsSpace });
                  
                  if (needsSpace && safePos < maxPos) {
                    // Insert a space after the pill to ensure typing works smoothly
                    const insertTr = freshState.tr;
                    insertTr.insertText(' ', safePos);
                    insertTr.setSelection(TextSelection.create(insertTr.doc, safePos + 1));
                    insertTr.setStoredMarks([]);
                    editor.view.dispatch(insertTr);
                    
                    debug('[TiptapEditor] Inserted space and repositioned cursor', {
                      safePos: safePos + 1,
                      spaceInserted: true
                    });
                  } else {
                    // Move cursor to safe position and clear stored marks again
                    const safeTr = freshState.tr;
                    safeTr.setSelection(TextSelection.create(safeTr.doc, safePos));
                    safeTr.setStoredMarks([]);
                    editor.view.dispatch(safeTr);
                    
                    debug('[TiptapEditor] Repositioned cursor to safe position', { safePos });
                  }
                }
              } else {
                // Not inside pill, but ensure stored marks are cleared anyway
                if (freshState.storedMarks && freshState.storedMarks.length > 0) {
                  debug('[TiptapEditor] Clearing stored marks', {
                    storedMarks: freshState.storedMarks.map((m: any) => m.type.name)
                  });
                  const clearTr = freshState.tr.setStoredMarks([]);
                  editor.view.dispatch(clearTr);
                } else {
                  debug('[TiptapEditor] No stored marks to clear');
                }
              }
              
              // Force focus using view directly (more reliable in form contexts)
              const { view } = editor;
              if (view && view.dom) {
                const dom = view.dom as HTMLElement;
                const finalPos = editor.state.selection.anchor;
                
                
                // Multiple focus attempts for form contexts
                // 1. Focus the editor DOM element directly
                dom.focus({ preventScroll: true });
                
                // 2. Use commands.focus() as backup
                editor.commands.focus();
                
                // 3. Also try focusing the contentEditable element directly if it exists
                const contentEditable = dom.querySelector('[contenteditable="true"]') as HTMLElement;
                if (contentEditable) {
                  contentEditable.focus({ preventScroll: true });
                }
                
                // 4. Force focus via requestAnimationFrame (ensures it happens after any form handlers)
                requestAnimationFrame(() => {
                  if (!editor || editor.isDestroyed) return;
                  if (!editor.view || !editor.view.dom) return;
                  
                  const dom = editor.view.dom as HTMLElement;
                  dom.focus({ preventScroll: true });
                  editor.commands.focus();
                  
                  const contentEditable = dom.querySelector('[contenteditable="true"]') as HTMLElement;
                  if (contentEditable) {
                    contentEditable.focus({ preventScroll: true });
                  }
                  
                  // 5. One more attempt after a short delay to ensure focus sticks
                  setTimeout(() => {
                    if (!editor || editor.isDestroyed) return;
                    if (!editor.view || !editor.view.dom) return;
                    
                    const dom = editor.view.dom as HTMLElement;
                    const contentEditable = dom.querySelector('[contenteditable="true"]') as HTMLElement;
                    const isFocused = document.activeElement === dom || 
                                    document.activeElement === contentEditable || 
                                    editor.isFocused;
                    
                    
                    if (!isFocused) {
                      // Last resort: force focus again
                      dom.focus({ preventScroll: true });
                      editor.commands.focus();
                      if (contentEditable) {
                        contentEditable.focus({ preventScroll: true });
                      }
                    }
                  }, 50);
                });
                
                // CRITICAL: Verify editor can actually receive input
                setTimeout(() => {
                  if (!editor || editor.isDestroyed) return;
                  if (!editor.view || !editor.view.dom) return;
                  
                  const dom = editor.view.dom as HTMLElement;
                  const contentEditable = dom.querySelector('[contenteditable="true"]') as HTMLElement;
                  const targetElement = contentEditable || dom;
                  
                  // Check if element is actually focusable and can receive input
                  const isFocusable = targetElement.tabIndex >= 0 || targetElement.contentEditable === 'true';
                  const isDisabled = (targetElement as any).disabled || targetElement.contentEditable === 'false';
                  const isReadOnly = (targetElement as any).readOnly;
                  
                  // Force focus one more time and verify
                  if (targetElement && isFocusable && !isDisabled && !isReadOnly) {
                    targetElement.focus({ preventScroll: true });
                    editor.commands.focus();
                  }
                }, 150);
                
                // CRITICAL: Force focus and test if editor can actually receive input
                setTimeout(() => {
                  if (!editor || editor.isDestroyed) return;
                  if (!editor.view || !editor.view.dom) return;
                  
                  const dom = editor.view.dom as HTMLElement;
                  const contentEditable = dom.querySelector('[contenteditable="true"]') as HTMLElement;
                  const targetElement = contentEditable || dom;
                  
                  // Force focus multiple times to ensure it sticks
                  targetElement.focus({ preventScroll: true });
                  editor.commands.focus();
                  
                  // Also try clicking to focus (sometimes needed in form contexts)
                  if (targetElement) {
                    targetElement.click();
                  }
                  
                  // Verify after a microtask
                  Promise.resolve().then(() => {
                    const isFocused = document.activeElement === targetElement || 
                                     document.activeElement === dom ||
                                     editor.isFocused;
                    
                    // If still not focused, try one more time with a small delay
                    if (!isFocused) {
                      setTimeout(() => {
                        targetElement.focus({ preventScroll: true });
                        editor.commands.focus();
                      }, 50);
                    }
                  });
                }, 10);
                
                // Ensure the cursor is visible by scrolling if needed
                try {
                  const coords = view.coordsAtPos(finalPos);
                  if (coords) {
                    const scrollContainer = dom.closest('.ProseMirror') || dom;
                    if (scrollContainer) {
                      const scrollRect = (scrollContainer as HTMLElement).getBoundingClientRect();
                      // Check if cursor is outside visible area
                      if (coords.top < scrollRect.top || coords.top > scrollRect.bottom) {
                        (scrollContainer as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                        debug('[TiptapEditor] Scrolled cursor into view', { finalPos, coords });
                      }
                    }
                  }
                } catch (scrollError) {
                  debug('[TiptapEditor] Error scrolling cursor into view', { scrollError });
                }
              } else {
                debug('[TiptapEditor] Cannot focus - view or dom missing', {
                  hasView: !!view,
                  hasDom: !!(view && view.dom)
                });
              }
            } catch (e) {
              debug('[TiptapEditor] Error during focus', { error: e });
            }
          }, 10); // Small delay to ensure transaction is processed
          
          // CRITICAL: Additional focus attempt after a longer delay
          // This ensures focus sticks even if form handlers interfere
          setTimeout(() => {
            try {
              if (!editor || editor.isDestroyed) return;
              if (!editor.view || !editor.view.dom) return;
              
              const dom = editor.view.dom as HTMLElement;
              const contentEditable = dom.querySelector('[contenteditable="true"]') as HTMLElement;
              
              // Force focus one more time
              if (contentEditable) {
                contentEditable.focus({ preventScroll: true });
              } else {
                dom.focus({ preventScroll: true });
              }
              editor.commands.focus();
              
              // Verify focus
              const isFocused = document.activeElement === dom || document.activeElement === contentEditable;
            } catch (e) {
              console.error('[TiptapEditor] Error in delayed focus', e);
            }
          }, 100); // Longer delay to ensure form handlers have finished
          
          // FINAL ATTEMPT: After all delays, force focus and test input capability
          setTimeout(() => {
            if (!editor || editor.isDestroyed) return;
            if (!editor.view || !editor.view.dom) return;
            
            const dom = editor.view.dom as HTMLElement;
            const contentEditable = dom.querySelector('[contenteditable="true"]') as HTMLElement;
            const targetElement = contentEditable || dom;
            
            
            // Force focus with all methods
            if (targetElement) {
              // Method 1: Direct focus
              targetElement.focus({ preventScroll: true });
              
              // Method 2: Click to focus (sometimes needed)
              const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
              targetElement.dispatchEvent(clickEvent);
              
              // Method 3: Editor commands
              editor.commands.focus();
              
              // Method 4: Set selection to ensure cursor is visible
              try {
                const doc = editor.state.doc;
                const endPos = doc.content.size;
                editor.commands.setTextSelection(endPos);
              } catch (e) {
                // Ignore
              }
            }
            
            // Verify after microtask
            Promise.resolve().then(() => {
              const isFocused = document.activeElement === targetElement || 
                               document.activeElement === dom ||
                               editor.isFocused;
              
            });
          }, 200); // Even longer delay to ensure everything has settled
          
          // TEST: Try to programmatically insert text to verify editor can receive input
          setTimeout(() => {
            if (!editor || editor.isDestroyed) return;
            if (!editor.view || !editor.view.dom) return;
            
            try {
              // Try to insert a test character programmatically
              const testChar = 'X';
              const { from, to } = editor.state.selection;
              
              // Test programmatic insertion (but undo immediately)
              if (editor.can().insertContent(testChar)) {
                editor.commands.insertContent(testChar);
                // Immediately undo to not affect user's content
                setTimeout(() => {
                  if (editor && !editor.isDestroyed) {
                    editor.commands.undo();
                  }
                }, 10);
              }
            } catch (e) {
              console.error('[TiptapEditor] Error testing programmatic insertion', e);
            }
          }, 250);
        } else {
          // Fallback: try to move cursor forward a bit
          const newPos = Math.min(currentCursorPos + 1, doc.content.size);
          const tr = editor.state.tr;
          tr.setSelection(TextSelection.create(tr.doc, newPos));
          tr.setStoredMarks([]);
          editor.view.dispatch(tr);
        }
      } else {
        // Restore original position if not inside pill
        // But first check if that position now has a pill mark (pill might have been created there)
        const $restorePos = doc.resolve(currentCursorPos);
        const restoreMarks = $restorePos.marks();
        const restoreHasPill = restoreMarks.some((m: any) => m.type.name === 'scripturePill');
        
        if (restoreHasPill) {
          // The restore position is now inside a pill, find position after it
          const restoreBoundaries = findPillBoundaries(doc, currentCursorPos);
          if (restoreBoundaries) {
            let cursorPos = restoreBoundaries.end;
            const maxPos = doc.content.size;
            
            // Find first position without pill mark
            let foundPosition = false;
            for (let pos = restoreBoundaries.end; pos <= Math.min(restoreBoundaries.end + 10, maxPos); pos++) {
              try {
                const $pos = doc.resolve(pos);
                const marks = $pos.marks();
                const hasPill = marks.some((m: any) => m.type.name === 'scripturePill');
                if (!hasPill) {
                  cursorPos = pos;
                  foundPosition = true;
                  break;
                }
              } catch (e) {
                cursorPos = pos;
                foundPosition = true;
                break;
              }
            }
            
            // If at end of document, use document end
            if (!foundPosition && restoreBoundaries.end >= maxPos - 1) {
              cursorPos = maxPos;
            }
            
            const tr = editor.state.tr;
            tr.setSelection(TextSelection.create(tr.doc, cursorPos));
            tr.setStoredMarks([]);
            editor.view.dispatch(tr);
            
            // Ensure editor is focused and ready for input
            setTimeout(() => {
              try {
                if (!editor || editor.isDestroyed) return;
                if (!editor.view || !editor.view.docView) return;
                
                // Force focus using view directly (more reliable in form contexts)
                const { view } = editor;
                if (view && view.dom) {
                  (view.dom as HTMLElement).focus();
                  editor.commands.focus();
                }
              } catch (e) {
                // Ignore errors during focus
              }
            }, 0);
          } else {
            // Fallback: clear marks at restore position
            const tr = editor.state.tr;
            tr.setSelection(TextSelection.create(tr.doc, currentCursorPos));
            tr.setStoredMarks([]);
            editor.view.dispatch(tr);
          }
        } else {
          // Position is safe, restore it
          const tr = editor.state.tr;
          tr.setSelection(TextSelection.create(tr.doc, currentCursorPos));
          tr.setStoredMarks([]);
          editor.view.dispatch(tr);
          
          // Ensure editor stays focused
          setTimeout(() => {
            try {
              if (!editor || editor.isDestroyed) return;
              if (!editor.view || !editor.view.docView) return;
              
              // Only focus if editor was already focused (don't steal focus unnecessarily)
              if (editor.isFocused) {
                const { view } = editor;
                if (view && view.dom) {
                  (view.dom as HTMLElement).focus();
                  editor.commands.focus();
                }
              }
            } catch (e) {
              // Ignore errors
            }
          }, 0);
        }
      }
    } catch (e) {
      // If cursor position is invalid, try to place cursor at end of document
      try {
        const doc = editor.state.doc;
        const endPos = doc.content.size;
        const tr = editor.state.tr;
        tr.setSelection(TextSelection.create(tr.doc, endPos));
        tr.setStoredMarks([]);
        editor.view.dispatch(tr);
      } catch (fallbackError) {
        // If even that fails, just leave it where it is
      }
    }
    // NOTE: Flag is now set immediately after pill transaction (see above)
    // This ensures it's ready when user types, before cursor positioning logic runs
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
  onEditorReady,
  onEditorInstanceReady
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
  const toolbarPositionUpdater = useRef<() => void>(() => {});
  const scrollCursorAboveToolbarRef = useRef<() => void>(() => {});

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
      
      // NOTE: Real-time scripture detection removed - pills are now created only on save
      // See convertScriptureReferencesToPills() which is called after save
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
        if (!editor) {
          return false;
        }
        
        // Check if editor is still valid (not destroyed)
        if (!isEditorValid(editor)) {
          return false;
        }
        
        // Check if view.docView is still valid (docView exists at runtime but not in TS types)
        if (!view || !(view as any).docView) {
          return false;
        }
        
        // Handle Cmd+Enter to submit form (dispatch event for parent panels to handle)
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          window.dispatchEvent(new CustomEvent('submitPanelForm'));
          return true; // Prevent default for Cmd+Enter only
        }
        
        // Handle regular Enter key - trigger auto-scroll after newline is created
        if (event.key === 'Enter' && !event.metaKey && !event.ctrlKey) {
          // Let ProseMirror handle the Enter key first, then trigger auto-scroll
          setTimeout(() => {
            // Update toolbar position in case it changed
            if (toolbarPositionUpdater.current) {
              toolbarPositionUpdater.current();
            }
            // Trigger cursor scroll after newline renders
            requestAnimationFrame(() => {
              if (scrollCursorAboveToolbarRef.current) {
                scrollCursorAboveToolbarRef.current();
              }
            });
            // Additional delayed check to ensure newline is fully rendered
            setTimeout(() => {
              if (scrollCursorAboveToolbarRef.current) {
                scrollCursorAboveToolbarRef.current();
              }
            }, 100);
          }, 50);
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
        if (event.key === ' ' && from === to && !scripturePillMark && !event.metaKey && !event.ctrlKey && !event.altKey) {
          const doc = view.state.doc;
          const $from = view.state.selection.$from;
          const paragraphStart = $from.start($from.depth);
          const textStart = Math.max(paragraphStart, from - 60);
          
          try {
            const textBeforeCursor = doc.textBetween(textStart, from);
            if (textBeforeCursor.trim().length > 0) {
              const references = detectScriptureReferences(textBeforeCursor);
              if (references.length > 0) {
                // Synchronously handle the space and the pill creation
                event.preventDefault();
                
                // Create a single transaction for the space insertion
                const tr = view.state.tr;
                tr.insertText(' ', from);
                tr.setStoredMarks([]);
                view.dispatch(tr);
                
                // Immediately create pills for the references found before the space
                // This now happens after the space is safely in the document
                createPendingPillsForReferences(editor, references);
                return true;
              }
            }
          } catch (e) {
            console.error('[TiptapEditor] Error in space detection:', e);
          }
        }
        
        if (scripturePillMark) {
          // Helper to check if entire pill is selected
          const isEntirePillSelected = (doc: any, from: number, to: number): boolean => {
            const boundaries = findPillBoundaries(doc, from);
            if (!boundaries) return false;
            return from === boundaries.start && to === boundaries.end;
          };
          
          const boundaries = findPillBoundaries(view.state.doc, from);
          
          // CRITICAL: Check if cursor is at the END boundary of the pill
          // The key insight: check if NEXT position does NOT have a pill mark
          let atEndOfPill = false;
          let nextHasPill = true; // default to true (inside pill)
          
          if (boundaries) {
            try {
              // Check if next position exists and doesn't have pill mark
              if (from < view.state.doc.content.size) {
                const $next = view.state.doc.resolve(from + 1);
                const nextMarks = $next.marks();
                nextHasPill = nextMarks.some((m: any) => m.type.name === 'scripturePill');
                
                // If next doesn't have pill AND we're at or past the boundary, we're truly after the pill
                if (!nextHasPill && from >= boundaries.end - 1) {
                  atEndOfPill = true;
                }
              } else {
                // At end of document
                if (from >= boundaries.end) {
                  atEndOfPill = true;
                  nextHasPill = false;
                }
              }
            } catch (e) {
              console.error('[TiptapEditor] Error checking next position:', e);
              // If we can't check next position, we're probably at the end of doc
              if (from >= boundaries.end) {
                atEndOfPill = true;
              }
            }
          }
          
          if (atEndOfPill) {
            return false; // Let ProseMirror handle the character insertion
          }
          
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
            
          if (from === to) {
            // Check if this is a printable character (not a control key)
            const isControlKey = event.key.length > 1 || 
              ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter', 'Escape', 'Home', 'End', 'PageUp', 'PageDown', 'Backspace', 'Delete'].includes(event.key);
            
            if (!isControlKey && !event.metaKey && !event.ctrlKey && !event.altKey) {
              // Move cursor to end of pill and then let ProseMirror handle character insertion
              editor.chain()
                .setTextSelection(boundaries.end)
                .run();
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
      
      // Call onEditorInstanceReady callback to notify parent components
      if (onEditorInstanceReady) {
        onEditorInstanceReady(editor);
      }
    }
    
    // Cleanup tracker and debounce timer when editor is destroyed
    return () => {
      if (id) {
        cleanupTracker(id);
      }
    };
  }, [editor, id, onEditorInstanceReady]);

  // Store editor reference on DOM for fallback event injection (backup method)
  useEffect(() => {
    if (!editor || !editor.view || !editor.view.dom) return;
    
    const dom = editor.view.dom as HTMLElement;
    const editorId = dom.id;
    
    // Only store for new-note-content editor
    if (editorId !== 'new-note-content') return;
    
    // Store editor reference on DOM element so fallback can access it
    (dom as any).__tiptapEditor = editor;
    
    
    // Also verify the reference can be accessed - check multiple times to catch DOM replacement
    const verifyRef = () => {
      if (!editor || editor.isDestroyed) return;
      if (!editor.view || !editor.view.dom) return;
      
      const currentDom = editor.view.dom as HTMLElement;
      const storedEditor = (currentDom as any).__tiptapEditor;
      
      if (storedEditor !== editor) {
        // Re-store if mismatch
        (currentDom as any).__tiptapEditor = editor;
      }
    };
    
    // Verify multiple times to catch any DOM replacement
    const verifyTimeout1 = setTimeout(verifyRef, 100);
    const verifyTimeout2 = setTimeout(verifyRef, 500);
    const verifyTimeout3 = setTimeout(verifyRef, 1000);
    
    // Also set up a MutationObserver to watch for DOM changes
    const observer = new MutationObserver(() => {
      verifyRef();
    });
    
    if (dom.parentNode) {
      observer.observe(dom.parentNode, { childList: true, subtree: true });
    }
    
    return () => {
      clearTimeout(verifyTimeout1);
      clearTimeout(verifyTimeout2);
      clearTimeout(verifyTimeout3);
      observer.disconnect();
      // Don't delete on cleanup - let it persist for fallback access
      // delete (dom as any).__tiptapEditor;
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

  // Add comprehensive event listeners at multiple levels to trace event propagation
  useEffect(() => {
    if (!editor || !editor.view || !editor.view.dom) return;
    
    const dom = editor.view.dom as HTMLElement;
    const editorId = dom.id;
    
    // Only add listener for new-note-content editor
    if (editorId !== 'new-note-content') return;
    
    const contentEditable = dom.querySelector('[contenteditable="true"]') as HTMLElement;
    
    // Direct DOM event listeners removed - no longer needed for debugging
    const handleKeyDownCapture = () => {};
    const handleKeyDownBubble = () => {};
    const handleKeyPress = () => {};
    const handleInput = () => {};
    
    // Add listeners with both capture and bubble phases
    dom.addEventListener('keydown', handleKeyDownCapture, true); // Capture
    dom.addEventListener('keydown', handleKeyDownBubble, false); // Bubble
    
    if (contentEditable) {
      contentEditable.addEventListener('keydown', handleKeyDownCapture, true);
      contentEditable.addEventListener('keydown', handleKeyDownBubble, false);
    }
    
    dom.addEventListener('keypress', handleKeyPress, true);
    dom.addEventListener('input', handleInput, true);
    
    return () => {
      dom.removeEventListener('keydown', handleKeyDownCapture, true);
      dom.removeEventListener('keydown', handleKeyDownBubble, false);
      if (contentEditable) {
        contentEditable.removeEventListener('keydown', handleKeyDownCapture, true);
        contentEditable.removeEventListener('keydown', handleKeyDownBubble, false);
      }
      dom.removeEventListener('keypress', handleKeyPress, true);
      dom.removeEventListener('input', handleInput, true);
    };
  }, [editor, id]);
  
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

      // Immediately detect keyboard height when editor focuses
      // Use multiple checks to catch keyboard animation timing
      if (toolbarPositionUpdater.current) {
        // Immediate check
        toolbarPositionUpdater.current();
        
        // After requestAnimationFrame (next frame)
        requestAnimationFrame(() => {
          toolbarPositionUpdater.current?.();
        });
        
        // After short delay (100ms) - catches initial keyboard animation
        setTimeout(() => {
          toolbarPositionUpdater.current?.();
        }, 100);
        
        // After longer delay (300ms) - catches final keyboard height
        setTimeout(() => {
          toolbarPositionUpdater.current?.();
        }, 300);
      }
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
          // Reset keyboard height when editor loses focus (keyboard closes)
          setKeyboardHeight(0);
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
  // Calculate keyboard height as the difference between window height and visual viewport height
  // This gives us the keyboard height without scroll interference
  useEffect(() => {
    const visualViewport = window.visualViewport;
    if (!visualViewport) return;
    
    let rafId: number | null = null;
    let delayedUpdateTimeout: ReturnType<typeof setTimeout> | null = null;
    let storedKeyboardHeight = 0; // Store detected keyboard height to keep it fixed

    const updateToolbarPosition = () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
      
      rafId = requestAnimationFrame(() => {
        // Check if editor is focused - keyboard only matters when editor is active
        const editorFocused = editor && isEditorValid(editor) && editor.isFocused;
        
        // Simple calculation: keyboard height = difference between window height and visible viewport height
        // Don't use offsetTop as it changes with scroll and causes incorrect positioning
        const keyboardHeight = window.innerHeight - visualViewport.height;

        // Only update if keyboard is likely open (>150px threshold) AND editor is focused
        // This prevents toolbar from staying at keyboard height when keyboard is closed
        if (keyboardHeight > 150 && editorFocused) {
          // Store the detected keyboard height and keep it fixed
          storedKeyboardHeight = keyboardHeight;
          setKeyboardHeight(keyboardHeight);

          // Schedule a delayed update to catch the final keyboard height after animation
          if (delayedUpdateTimeout) {
            clearTimeout(delayedUpdateTimeout);
          }
          delayedUpdateTimeout = setTimeout(() => {
            // Re-check focus state in case it changed
            const stillFocused = editor && isEditorValid(editor) && editor.isFocused;
            const finalKeyboardHeight = window.innerHeight - visualViewport.height;
            if (finalKeyboardHeight > 150 && stillFocused) {
              storedKeyboardHeight = finalKeyboardHeight;
              setKeyboardHeight(finalKeyboardHeight);
            } else if (!stillFocused || finalKeyboardHeight <= 150) {
              // Editor lost focus or keyboard closed - reset
              storedKeyboardHeight = 0;
              setKeyboardHeight(0);
            }
          }, 150);
        } else {
          // Keyboard closed or editor not focused - reset stored height
          storedKeyboardHeight = 0;
          setKeyboardHeight(0);
        }
      });
    };

    toolbarPositionUpdater.current = updateToolbarPosition;

    // Handle scroll events to update toolbar position
    // This ensures toolbar follows scroll while maintaining 12px above keyboard
    const handleScroll = () => {
      // Update toolbar position based on current scroll state
      // Maintain 12px above keyboard
      updateToolbarPosition();
    };

    // Listen to resize events for keyboard open/close
    visualViewport.addEventListener('resize', updateToolbarPosition);
    window.addEventListener('resize', updateToolbarPosition);
    
    // Listen to scroll events to update toolbar position when scrolling
    // Use visualViewport scroll if available (mobile browsers)
    if (visualViewport.addEventListener) {
      visualViewport.addEventListener('scroll', handleScroll);
    }
    
    // Also listen to content container scroll as fallback
    let contentContainer: HTMLElement | null = null;
    if (editor?.view?.dom) {
      contentContainer = editor.view.dom.closest('.tiptap-content') as HTMLElement;
      if (contentContainer) {
        contentContainer.addEventListener('scroll', handleScroll);
      }
    }

    // Initial check
    updateToolbarPosition();

    return () => {
      visualViewport.removeEventListener('resize', updateToolbarPosition);
      window.removeEventListener('resize', updateToolbarPosition);
      if (visualViewport.removeEventListener) {
        visualViewport.removeEventListener('scroll', handleScroll);
      }
      if (contentContainer) {
        contentContainer.removeEventListener('scroll', handleScroll);
      }
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
      if (delayedUpdateTimeout) {
        clearTimeout(delayedUpdateTimeout);
      }
    };
  }, [editor]); // Add editor dependency to check focus state

  // Auto-scroll cursor above toolbar when typing
  // This ensures cursor stays visible above the fixed toolbar
  useEffect(() => {
    if (!editor || !isEditorFocused || keyboardHeight === 0) return;
    if (!isEditorValid(editor)) return;

    const scrollCursorAboveToolbar = () => {
      if (!isEditorValid(editor)) return;
      
      const editorElement = editor.view.dom;
      const contentContainer = editorElement?.closest('.tiptap-content') as HTMLElement;
      if (!contentContainer) return;

      try {
        // Get cursor position in the editor
        const { from } = editor.state.selection;
        
        // Get the DOM coordinates for the cursor
        const coords = editor.view.coordsAtPos(from);
        if (!coords) return;

        // Get container's viewport position
        const containerRect = contentContainer.getBoundingClientRect();
        
        // Calculate where toolbar is positioned (keyboardHeight + 12px offset)
        // Toolbar height is approximately 48px, so we want cursor at least 60px above keyboard
        const toolbarTop = window.innerHeight - keyboardHeight - 12 - 48;
        const safeAreaTop = toolbarTop - 20; // 20px padding above toolbar
        
        // Check if cursor is below the safe area
        const cursorTop = coords.top;
        const cursorBottom = coords.bottom;
        
        // If cursor is below or overlapping with toolbar area, scroll it up
        if (cursorBottom > safeAreaTop || cursorTop < containerRect.top) {
          // Calculate how much we need to scroll
          // We want the cursor to be at the safe area top
          const cursorRelativeTop = cursorTop - containerRect.top + contentContainer.scrollTop;
          const targetScrollTop = cursorRelativeTop - (safeAreaTop - containerRect.top) - 20;
          
          // Scroll to keep cursor visible above toolbar
          contentContainer.scrollTo({
            top: Math.max(0, targetScrollTop),
            behavior: 'smooth'
          });
        }
      } catch (error) {
        // Silently ignore errors (e.g., if editor is destroyed)
      }
    };

    // Store function in ref so it can be called from handleKeyDown
    scrollCursorAboveToolbarRef.current = scrollCursorAboveToolbar;

    // Use requestAnimationFrame to debounce scroll updates
    let rafId: number | null = null;
    const debouncedScroll = () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
      rafId = requestAnimationFrame(scrollCursorAboveToolbar);
    };

    // Listen to selection updates and content updates
    editor.on('selectionUpdate', debouncedScroll);
    editor.on('update', debouncedScroll);

    return () => {
      scrollCursorAboveToolbarRef.current = () => {}; // Clear ref
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
      if (editor && !editor.isDestroyed) {
        editor.off('selectionUpdate', debouncedScroll);
        editor.off('update', debouncedScroll);
      }
    };
  }, [editor, isEditorFocused, keyboardHeight]);

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
        onMouseDown={(e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
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
        onClick={(e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
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
        onMouseUp={(e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
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
        onClick={(e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
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
            shouldShow={({ editor }: { editor: any }) => {
              // Check if editor is still valid before checking selection
              if (!isEditorValid(editor)) return false;
              return isValidSelection(editor);
            }}
          >
            <div style={{ zIndex: 99999, pointerEvents: 'auto', display: 'inline-block' }}>
              <ButtonSmall
                state="Default"
                onMouseDown={(e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
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
