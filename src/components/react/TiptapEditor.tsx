import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useEditor, EditorContent } from '@tiptap/react';
// BubbleMenu replaced with custom createPortal-based floating toolbar for reliability
import StarterKit from '@tiptap/starter-kit';
import Heading from '@tiptap/extension-heading';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import Superscript from '@tiptap/extension-superscript';
import { getMarkRange } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import { DOMSerializer } from '@tiptap/pm/model';
import { NoteLink } from './TiptapNoteLink';
import { ScripturePill } from './TiptapScripturePill';
import { BoldCustom } from './TiptapBoldCustom';
import { HighlightCustom } from './TiptapHighlightCustom';
import { normalizeScriptureReference, detectScriptureReferences, matchTrailingTranslationAbbreviation, type ScriptureReference, type ScriptureReferenceWithTranslation } from '@/utils/scripture-detector';
import { TRANSLATION_ORDER, TRANSLATIONS } from '@/data/translations';
import { getCachedProfileData } from '@/utils/profile-cache';
import { safeNavigate } from '@/utils/safe-navigate';
import { idToUrl, extractIdFromPath } from '@/utils/url-helpers';
import { pushNavStack } from '@/utils/nav-stack';
import { shouldProcessDocument, getTextToProcess, resetTracker, cleanupTracker } from '@/utils/incremental-scripture-detection';
import { debug } from '@/utils/logger';
import { getOrCreateScriptureNote } from '@/utils/scripture-note-utils';
import '@/styles/tiptap-editor.css';

// Icon component for inline SVGs (allows CSS styling)
import Icon from './Icon';

// Track pending pill creation to prevent duplicates from concurrent calls
// This is a module-level Set to track references currently being processed
const pendingPillCreations = new Set<string>();

// Track a recently created pill that hasn't had its translation resolved yet.
// On the next space/Enter, we check if the user typed a translation abbreviation after it.
let pendingTranslationPill: {
  reference: string;
  editorId: string; // to scope to the correct editor instance
  timeoutId: ReturnType<typeof setTimeout> | null;
} | null = null;

// Toast is declared globally elsewhere - no need to redeclare here

interface TiptapEditorProps {
  content: string;
  id?: string;
  name?: string;
  placeholder?: string;
  minimalToolbar?: boolean;
  toolbarAtBottom?: boolean;
  /** When toolbarAtBottom, margin below the toolbar in px. Default 12. Use 0 when the parent provides the gap (e.g. Save/Cancel row has top margin). */
  toolbarBottomMargin?: number;
  tabindex?: number;
  onContentChange?: (content: string) => void;
  scrollPosition?: number;
  enableCreateNoteFromSelection?: boolean;
  parentThreadId?: string;
  sourceNoteId?: string; // ID of the note this editor is editing (for hyperlink creation)
  onEditorReady?: (editor: any) => void;
  onEditorInstanceReady?: (editor: any) => void; // Callback when editor instance is ready for direct access
  /** When true (e.g. new-note bottom sheet), scroll selection into view above toolbar when keyboard is open. */
  inBottomSheet?: boolean;
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
    // Normalize BEFORE escaping so we can build flexible patterns correctly
    // Split on dashes, colons, and spaces to build a pattern that allows flexible spacing
    const tokens = searchText.split(/(\s*[-–—]\s*|\s*:\s*|\s+)/);
    const patternParts = tokens.map(token => {
      if (/^\s*[-–—]\s*$/.test(token)) {
        return '\\s*[-–—]\\s*'; // Flexible dash spacing (any dash type)
      } else if (/^\s*:\s*$/.test(token)) {
        return '\\s*:\\s*'; // Flexible colon spacing
      } else if (/^\s+$/.test(token)) {
        return '\\s+'; // Flexible whitespace
      } else {
        return token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // Escape literal text
      }
    });
    const flexiblePattern = patternParts.join('');

    try {
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
    } catch {
      // Invalid regex - skip flexible matching
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
      // Also check nodeAfter marks — $p.marks() misses inclusive:false marks at the start boundary
      const nodeAfterHasPill = $p.nodeAfter?.marks?.some((m: any) => m.type.name === 'scripturePill');
      if (!hasPill && !nodeAfterHasPill) {
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

/** Move cursor after a leading scripture pill (e.g. VOTD → Create note); end-of-doc can still resolve inside the mark. */
export function placeCursorAfterLeadingScripturePill(editor: any): void {
  try {
    const { doc } = editor.state;
    if (doc.textContent.trim().length === 0) {
      editor.commands.setTextSelection(1);
      return;
    }
    const maxPos = doc.content.size;
    editor.commands.setTextSelection(maxPos);
    let $from = editor.state.selection.$from;
    let inPill = $from.marks().some((m: any) => m.type.name === 'scripturePill');
    if (!inPill) {
      return;
    }
    const probePos = Math.min(Math.max(1, $from.pos), maxPos - 1);
    const boundaries = findPillBoundaries(doc, probePos);
    if (!boundaries) {
      return;
    }
    let pos = boundaries.end;
    while (pos <= maxPos) {
      try {
        const marks = doc.resolve(pos).marks();
        const stillIn = marks.some((m: any) => m.type.name === 'scripturePill');
        if (!stillIn) {
          editor.commands.setTextSelection(pos);
          return;
        }
      } catch {
        editor.commands.setTextSelection(pos);
        return;
      }
      pos += 1;
    }
    editor.commands.setTextSelection(maxPos);
  } catch {
    try {
      editor.commands.setTextSelection(editor.state.doc.content.size);
    } catch {
      /* ignore */
    }
  }
}

/** If the cursor (collapsed or user-select:all range) is inside a scripture pill, move it after the pill. */
export function snapCursorOutsideScripturePill(editor: any): void {
  if (!editor || editor.isDestroyed || !editor.state) return;
  try {
    const { state } = editor;
    const sel = state.selection;

    const markType = state.schema.marks.scripturePill;
    if (!markType) return;

    const $from = sel.$from;
    const parent = $from.parent;
    const offset = $from.parentOffset;

    const after = parent.childAfter(offset);
    const afterInPill = after.node?.marks.some((m: any) => m.type === markType) ?? false;
    const before = parent.childBefore(offset);
    const beforeInPill = before.node?.marks.some((m: any) => m.type === markType) ?? false;

    if (!afterInPill && !beforeInPill) return;

    // Cursor right after pill AND nothing follows in the paragraph:
    // visually the cursor is inside the pill's styled box.
    // Insert an empty paragraph so the cursor has somewhere outside.
    if (beforeInPill && !afterInPill) {
      const atEndOfParent = offset === parent.content.size;
      if (atEndOfParent) {
        const endOfBlock = $from.after($from.depth);
        const paragraphType = state.schema.nodes.paragraph;
        if (!paragraphType) return;
        const tr = state.tr;
        tr.insert(endOfBlock, paragraphType.create());
        tr.setSelection(TextSelection.create(tr.doc, endOfBlock + 1));
        tr.setStoredMarks([]);
        tr.setMeta('addToHistory', false);
        editor.view.dispatch(tr);
        return;
      }
      if (sel.empty) return;
    }

    const range = getMarkRange($from, markType)
      || (beforeInPill ? getMarkRange(state.doc.resolve(Math.max(0, sel.from - 1)), markType) : null);
    if (!range) return;
    if (sel.empty && sel.from === range.to) return;

    const tr = state.tr
      .setSelection(TextSelection.create(state.doc, range.to))
      .setStoredMarks([])
      .setMeta('addToHistory', false);
    editor.view.dispatch(tr);
  } catch {
    /* ignore */
  }
}

// Helper: find pill boundaries by iterating the paragraph's child nodes directly
// This avoids all the inclusive:false mark resolution issues at boundaries
function findAdjacentPillBoundaries(
  doc: any,
  pos: number,
  direction: 'before' | 'after'
): { start: number; end: number } | null {
  try {
    const $pos = doc.resolve(pos);
    const parent = $pos.parent;
    const parentStart = $pos.start($pos.depth); // absolute position of parent content start

    if (direction === 'before') {
      // Walk backward through children to find a pill just before cursor
      let offset = 0;
      let lastPillStart = -1;
      let lastPillEnd = -1;

      for (let i = 0; i < parent.childCount; i++) {
        const child = parent.child(i);
        const childStart = parentStart + offset;
        const childEnd = childStart + child.nodeSize;

        if (child.marks.some((m: any) => m.type.name === 'scripturePill')) {
          // Extend or start a pill range (pills can span multiple text nodes)
          if (lastPillEnd === childStart) {
            // Contiguous with previous pill node
            lastPillEnd = childEnd;
          } else {
            lastPillStart = childStart;
            lastPillEnd = childEnd;
          }
        }

        // If this child ends at or past the cursor, we've gone far enough
        if (childEnd >= pos) break;
        offset += child.nodeSize;
      }

      // Check if the found pill is adjacent (directly or with one space gap)
      if (lastPillStart >= 0 && lastPillEnd > 0) {
        const gap = pos - lastPillEnd;
        if (gap <= 1) {
          // Delete pill + any trailing space
          return { start: lastPillStart, end: pos };
        }
      }
    }

    if (direction === 'after') {
      // Walk forward through children to find a pill just after cursor
      let offset = 0;

      for (let i = 0; i < parent.childCount; i++) {
        const child = parent.child(i);
        const childStart = parentStart + offset;
        const childEnd = childStart + child.nodeSize;

        if (childStart >= pos && child.marks.some((m: any) => m.type.name === 'scripturePill')) {
          // Find the full pill end (may span multiple nodes)
          let pillEnd = childEnd;
          for (let j = i + 1; j < parent.childCount; j++) {
            const next = parent.child(j);
            if (next.marks.some((m: any) => m.type.name === 'scripturePill')) {
              pillEnd = parentStart + offset + child.nodeSize;
              // recalculate properly
              let o2 = 0;
              for (let k = 0; k <= j; k++) o2 += parent.child(k).nodeSize;
              pillEnd = parentStart + o2;
            } else break;
          }
          return { start: pos, end: pillEnd };
        }

        if (childStart > pos + 1) break;
        offset += child.nodeSize;
      }
    }
  } catch (e) {}

  return null;
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
        
        // Skip only when the ENTIRE range [candidateFrom, candidateTo) is already inside
        // scripture pills. If only part of the range has a pill (e.g. "Matthew 1:12" in a pill
        // and " -13" plain), we still return this position so the caller can replace/extend
        // with one pill for the full reference.
        if (skipMarked) {
          try {
            const rangeLen = candidateTo - candidateFrom;
            // Sample positions across the range; skip only if every sampled position has a pill
            const sampleCount = Math.min(rangeLen, 8);
            const step = rangeLen <= sampleCount ? 1 : Math.max(1, Math.floor(rangeLen / (sampleCount - 1)));
            let allHavePill = true;
            for (let i = 0; i < rangeLen; i += step) {
              const pos = candidateFrom + (i === 0 ? 0 : Math.min(i, rangeLen - 1));
              try {
                const $p = doc.resolve(pos);
                // Check both $p.marks() and nodeAfter.marks for non-inclusive mark boundary handling
                const hasPill = $p.marks().some((m: any) => m.type.name === 'scripturePill')
                  || ($p.nodeAfter?.marks?.some((m: any) => m.type.name === 'scripturePill') ?? false);
                if (!hasPill) {
                  allHavePill = false;
                  break;
                }
              } catch (e) {
                allHavePill = false;
                break;
              }
            }
            // Also check the last position in the range
            if (allHavePill && rangeLen > 0) {
              try {
                const $last = doc.resolve(candidateTo - 1);
                const lastHasPill = $last.marks().some((m: any) => m.type.name === 'scripturePill')
                  || ($last.nodeAfter?.marks?.some((m: any) => m.type.name === 'scripturePill') ?? false);
                if (!lastHasPill) {
                  allHavePill = false;
                }
              } catch (e) {
                allHavePill = false;
              }
            }
            if (allHavePill) {
              continue; // Entire range already in pill(s), skip
            }
          } catch (e) {
            // If we can't resolve, don't skip so caller can try to apply
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

/**
 * Space, newline, or cursor at the start of a block (e.g. after Return splits a paragraph).
 * ProseMirror does not insert \\n in the text node for paragraph breaks, so we must treat
 * parentOffset === 0 as a boundary — same role as Space for creating a pill.
 */
function isScripturePillBoundaryCursor($from: any, doc: any): boolean {
  if ($from.parentOffset > 0) {
    const charBefore = doc.textBetween($from.pos - 1, $from.pos);
    return charBefore === ' ' || charBefore === '\n' || charBefore === '\r';
  }
  // New paragraph/block after Enter: not document start (pos 1 = empty first block)
  if ($from.parentOffset === 0 && $from.pos > 1) {
    return true;
  }
  return false;
}

/** Up to 60 chars before cursor, may span blocks so "ref + Enter" still sees the reference. */
function getTextBeforeCursorForScripture(editor: any): string {
  const { from } = editor.state.selection;
  const textStart = Math.max(0, from - 60);
  return editor.state.doc.textBetween(textStart, from);
}

// Helper function to check/create scripture note and get noteId

/**
 * Resolves a pending translation pill. Finds the pill in the doc, checks the text immediately
 * after it for a valid translation abbreviation. If found, applies it and deletes the abbreviation.
 * Otherwise applies the user's default translation.
 * @returns true if an abbreviation was consumed from the text (so we can skip normal detection)
 */
function resolvePendingTranslationPill(editor: any): boolean {
  if (!pendingTranslationPill || !editor || editor.isDestroyed) {
    pendingTranslationPill = null;
    return false;
  }

  const { reference } = pendingTranslationPill;
  pendingTranslationPill = null;

  try {
    const view = editor.view;
    const doc = view.state.doc;
    const markType = view.state.schema.marks.scripturePill;
    if (!markType) return false;

    // Find the pill in the document by looking for the scripturePill mark with matching reference and null translation
    let pillFrom = -1, pillTo = -1;
    doc.descendants((node: any, pos: number) => {
      if (pillFrom !== -1) return false; // already found
      if (!node.isText) return;
      const pillMark = node.marks.find((m: any) => m.type.name === 'scripturePill' && !m.attrs.translation);
      if (pillMark && normalizeScriptureReference(pillMark.attrs.reference) === normalizeScriptureReference(reference)) {
        pillFrom = pos;
        pillTo = pos + node.nodeSize;
        return false;
      }
    });

    if (pillFrom === -1) return false;

    // Check text between the pill and the current cursor for a translation abbreviation
    const cursorPos = view.state.selection.from;
    // Scan from pill end to cursor position (the user typed the abbreviation here)
    const scanEnd = Math.min(cursorPos, doc.content.size);
    let textAfterPill = '';
    if (pillTo < scanEnd) {
      try {
        textAfterPill = doc.textBetween(pillTo, scanEnd);
      } catch (_) { /* cross-node boundary */ }
    }

    const trailing = matchTrailingTranslationAbbreviation(textAfterPill);
    let resolvedTranslation: string;
    let consumedAbbrev = false;

    if (trailing) {
      resolvedTranslation = trailing.canonicalId;
      consumedAbbrev = true;
      // Delete the abbreviation text from the doc
      const deleteFrom = pillTo;
      const deleteTo = pillTo + trailing.consumed.length;
      const tr = view.state.tr;
      tr.delete(deleteFrom, deleteTo);
      // Update the pill mark with the resolved translation
      tr.addMark(pillFrom, pillTo, markType.create({
        reference,
        noteId: 'pending',
        translation: resolvedTranslation,
      }));
      tr.setMeta('addToHistory', false);
      tr.setStoredMarks([]);
      view.dispatch(tr);
    } else {
      // No abbreviation — apply user's default
      resolvedTranslation = getCachedProfileData()?.defaultTranslation || 'NET';
      const tr = view.state.tr;
      tr.addMark(pillFrom, pillTo, markType.create({
        reference,
        noteId: 'pending',
        translation: resolvedTranslation,
      }));
      tr.setMeta('addToHistory', false);
      view.dispatch(tr);
    }

    return consumedAbbrev;
  } catch (e) {
    console.error('[TiptapEditor] Error resolving pending translation pill:', e);
    return false;
  }
}

/**
 * If text after the new pill is already a full translation abbreviation, consume it and set the mark.
 * Does not apply the profile default (so the user can still type an abbrev after a lone "ref + space").
 */
function tryConsumeTranslationAbbrevAfterPill(editor: any): boolean {
  if (!pendingTranslationPill || !editor || editor.isDestroyed) return false;
  const { reference, timeoutId } = pendingTranslationPill;
  try {
    const view = editor.view;
    const doc = view.state.doc;
    const markType = view.state.schema.marks.scripturePill;
    if (!markType) return false;

    let pillFrom = -1;
    let pillTo = -1;
    doc.descendants((node: any, pos: number) => {
      if (pillFrom !== -1) return false;
      if (!node.isText) return;
      const pillMark = node.marks.find((m: any) => m.type.name === 'scripturePill' && !m.attrs.translation);
      if (pillMark && normalizeScriptureReference(pillMark.attrs.reference) === normalizeScriptureReference(reference)) {
        pillFrom = pos;
        pillTo = pos + node.nodeSize;
        return false;
      }
    });

    if (pillFrom === -1) return false;

    const cursorPos = view.state.selection.from;
    const scanEnd = Math.min(cursorPos, doc.content.size);
    let textAfterPill = '';
    if (pillTo < scanEnd) {
      try {
        textAfterPill = doc.textBetween(pillTo, scanEnd);
      } catch (_) {
        /* cross-node boundary */
      }
    }

    const trailing = matchTrailingTranslationAbbreviation(textAfterPill);
    if (!trailing) return false;

    const deleteFrom = pillTo;
    const deleteTo = pillTo + trailing.consumed.length;
    const tr = view.state.tr;
    tr.delete(deleteFrom, deleteTo);
    tr.addMark(pillFrom, pillTo, markType.create({
      reference,
      noteId: 'pending',
      translation: trailing.canonicalId,
    }));
    tr.setMeta('addToHistory', false);
    tr.setStoredMarks([]);
    view.dispatch(tr);

    if (timeoutId) clearTimeout(timeoutId);
    pendingTranslationPill = null;
    return true;
  } catch (e) {
    console.error('[TiptapEditor] Error consuming translation abbrev after pill:', e);
    return false;
  }
}

function schedulePendingTranslationAfterPillCreation(
  editor: any,
  references: (ScriptureReference | ScriptureReferenceWithTranslation)[],
) {
  if (!references.length) return;
  const lastRef = references[references.length - 1];
  const editorId = String(editor.view?.dom?.id || 'default');
  if (pendingTranslationPill?.timeoutId) clearTimeout(pendingTranslationPill.timeoutId);
  pendingTranslationPill = {
    reference: lastRef.reference,
    editorId,
    timeoutId: null,
  };
  if (!tryConsumeTranslationAbbrevAfterPill(editor)) {
    const timeoutId = setTimeout(() => {
      if (pendingTranslationPill?.editorId === editorId) {
        resolvePendingTranslationPill(editor);
      }
    }, 3000);
    if (pendingTranslationPill) {
      pendingTranslationPill.timeoutId = timeoutId;
    }
  }
}

// Helper function to convert scripture references to pills using processed results data
// This is more reliable than parsing HTML since Tiptap may have already parsed/removed spans
// Helper function to create pending pills for detected scripture references
// Helper function to create pending pills for detected scripture references
// This is called after space key press to show visual feedback
function createPendingPillsForReferences(editor: any, references: (ScriptureReference | ScriptureReferenceWithTranslation)[], translation?: string) {
  if (!editor || !references || references.length === 0) {
    return;
  }

  // Filter out references that are already being processed (prevents duplicates)
  const newReferences = references.filter(ref => {
    const normalizedRef = normalizeScriptureReference(ref.reference);
    if (pendingPillCreations.has(normalizedRef)) {
      return false; // Skip - already being processed
    }
    pendingPillCreations.add(normalizedRef);
    return true;
  });

  if (newReferences.length === 0) {
    return; // All references are already being processed
  }

  // Clear pending pills after processing to prevent duplicates
  // This 500ms delay ensures we don't recreate pills that are already being processed
  setTimeout(() => {
    newReferences.forEach(ref => {
      pendingPillCreations.delete(normalizeScriptureReference(ref.reference));
    });
  }, 500);

  try {
    const view = editor.view;
    let state = view.state;
    let tr = state.tr;
    let modified = false;

    // Save the current cursor position
    const originalCursorPos = state.selection.from;

    for (const ref of newReferences) {
      const reference = ref.reference;
      if (!reference) continue;
      
      const doc = tr.doc;
      const positions = findAllTextPositions(doc, reference, true);
      
      for (let i = positions.length - 1; i >= 0; i--) {
        const pos = positions[i];
        
        try {
          const $from = doc.resolve(pos.from);
          // Non-inclusive marks may not appear in $pos.marks() at boundaries.
          // Check both $from.marks() and the text node at this position.
          let pillMark = $from.marks().find((m: any) => m.type.name === 'scripturePill');
          if (!pillMark) {
            // Check text node at pos.from (nodeAfter) for the mark
            const nodeAt = $from.nodeAfter;
            if (nodeAt) {
              pillMark = nodeAt.marks.find((m: any) => m.type.name === 'scripturePill');
            }
          }
          if (!pillMark && pos.from + 1 <= doc.content.size) {
            // Check one position inside
            try {
              const $inside = doc.resolve(pos.from + 1);
              pillMark = $inside.marks().find((m: any) => m.type.name === 'scripturePill');
            } catch (_) {}
          }

          // Skip if pill already exists — don't overwrite it (preserves translation and noteId)
          if (pillMark) {
            continue;
          }
          
          if (!isWithinSingleParagraph(doc, pos.from, pos.to)) continue;
          const adjustedPos = adjustPositionForParagraphBoundary(doc, pos.from, pos.to);
          if (!isWithinSingleParagraph(doc, adjustedPos.from, adjustedPos.to)) continue;
          
          const markType = state.schema.marks.scripturePill;
          if (markType) {
            // Use explicit translation if provided, otherwise null (deferred — set on next space/Enter or timeout)
            const pillTranslation = translation || null;

            // Replace text with canonical reference when it differs (e.g. "john 3:16" -> "John 3:16")
            const currentText = tr.doc.textBetween(adjustedPos.from, adjustedPos.to);
            // Normalize both sides for comparison (handle spacing around dashes/colons)
            const normalizeRef = (s: string) => s.replace(/\s*[-–—]\s*/g, '-').replace(/\s*:\s*/g, ':').trim();
            if (normalizeRef(currentText) !== normalizeRef(reference)) {
              const textNode = state.schema.text(reference, [
                markType.create({ reference, noteId: 'pending', translation: pillTranslation })
              ]);
              tr.replaceWith(adjustedPos.from, adjustedPos.to, textNode);
            } else {
              tr.removeMark(adjustedPos.from, adjustedPos.to, markType);
              tr.addMark(adjustedPos.from, adjustedPos.to, markType.create({
                reference,
                noteId: 'pending',
                translation: pillTranslation,
              }));
            }
            modified = true;
          }
        } catch (e) {
          continue;
        }
      }
    }
    
    if (modified) {
      tr.setMeta('addToHistory', false);
      // Clear stored marks so next typed character won't inherit the pill mark
      tr.setStoredMarks([]);
      view.dispatch(tr);

      // Update our local state reference after dispatch
      state = view.state;
    }

    // Safety-net: clear stored marks after a brief delay so the next typed
    // character won't inherit the pill mark.  Do NOT reposition the cursor —
    // the space was already inserted and the cursor is already in the correct
    // position (after the space, outside the pill).  Calling Selection.near()
    // can snap the cursor to before the space in some edge cases, eating it.
    setTimeout(() => {
      if (!editor || editor.isDestroyed) return;
      const view = editor.view;
      const curState = view.state;

      // Only act if stored marks still contain the pill mark
      const stored = curState.storedMarks;
      if (stored && stored.some((m: any) => m.type.name === 'scripturePill')) {
        const clearTr = curState.tr.setStoredMarks(
          stored.filter((m: any) => m.type.name !== 'scripturePill')
        );
        clearTr.setMeta('addToHistory', false);
        view.dispatch(clearTr);
      }

      // If the cursor somehow ended up inside the pill, nudge it just past the pill end
      try {
        const $cur = view.state.doc.resolve(view.state.selection.from);
        const insidePill = $cur.marks().some((m: any) => m.type.name === 'scripturePill')
          || ($cur.nodeAfter?.marks?.some((m: any) => m.type.name === 'scripturePill') && $cur.nodeBefore === null);
        if (insidePill) {
          // Find pill end
          let pillEnd = view.state.selection.from;
          for (let p = pillEnd; p <= view.state.doc.content.size; p++) {
            const $p = view.state.doc.resolve(p);
            if (!$p.marks().some((m: any) => m.type.name === 'scripturePill')) {
              pillEnd = p;
              break;
            }
          }
          const moveTr = view.state.tr.setSelection(
            TextSelection.create(view.state.doc, pillEnd)
          );
          moveTr.setStoredMarks([]);
          moveTr.setMeta('addToHistory', false);
          view.dispatch(moveTr);
        }
      } catch (_) {}
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
      const pendingPills: Array<{from: number, to: number}> = [];

      doc.descendants((node: any, pos: number) => {
        if (node.marks) {
          const pillMark = node.marks.find((m: any) => m.type.name === 'scripturePill');
          if (pillMark && pillMark.attrs.noteId === 'pending') {
            pendingPills.push({ from: pos, to: pos + node.nodeSize });
          }
        }
      });

      // Batch all removals into a single transaction (one view update)
      if (pendingPills.length > 0) {
        const tr = editor.state.tr;
        for (let i = pendingPills.length - 1; i >= 0; i--) {
          tr.removeMark(pendingPills[i].from, pendingPills[i].to, editor.state.schema.marks.scripturePill);
        }
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
    
    // Batch remove invalid pending pills in a single transaction
    if (pendingPillsToRemove.length > 0) {
      const tr = editor.state.tr;
      for (let i = pendingPillsToRemove.length - 1; i >= 0; i--) {
        tr.removeMark(pendingPillsToRemove[i].from, pendingPillsToRemove[i].to, editor.state.schema.marks.scripturePill);
      }
      editor.view.dispatch(tr);
    }
    
    // Step 2: Collect all mark operations, then apply in a single transaction
    // This avoids dispatching per-pill (each dispatch triggers a full view update).
    type MarkOp = { from: number; to: number; normalizedRef: string; noteId: string; translation?: string | null };
    const markOps: MarkOp[] = [];

    for (const result of scriptureResults) {
      const { reference, noteId } = result;
      if (!reference || !noteId) continue;

      const normalizedRef = normalizeScriptureReference(reference);
      const positions = findAllTextPositions(doc, reference, false);
      if (positions.length === 0) continue;

      for (let i = positions.length - 1; i >= 0; i--) {
        const pos = positions[i];

        try {
          const $from = doc.resolve(pos.from);
          // Non-inclusive marks may not appear in $pos.marks() at boundaries
          let pillMark = $from.marks().find((m: any) => m.type.name === 'scripturePill');
          if (!pillMark && $from.nodeAfter) {
            pillMark = $from.nodeAfter.marks.find((m: any) => m.type.name === 'scripturePill');
          }
          if (!pillMark && pos.from + 1 <= doc.content.size) {
            try {
              const $inside = doc.resolve(pos.from + 1);
              pillMark = $inside.marks().find((m: any) => m.type.name === 'scripturePill');
            } catch (_) {}
          }

          if (pillMark) {
            if (pillMark.attrs.noteId === 'pending') {
              markOps.push({ from: pos.from, to: pos.to, normalizedRef, noteId, translation: pillMark.attrs.translation });
            }
            continue;
          }

          if (!isWithinSingleParagraph(doc, pos.from, pos.to)) continue;

          const adjustedPos = adjustPositionForParagraphBoundary(doc, pos.from, pos.to);
          if (!isWithinSingleParagraph(doc, adjustedPos.from, adjustedPos.to)) continue;

          // Verify text matches and trim trailing whitespace
          try {
            let textAtPosition = doc.textBetween(adjustedPos.from, adjustedPos.to);
            const trimmedText = textAtPosition.trimEnd();
            if (normalizeScriptureReference(trimmedText) !== normalizeScriptureReference(reference)) continue;

            if (textAtPosition !== trimmedText) {
              adjustedPos.to -= (textAtPosition.length - trimmedText.length);
              if (adjustedPos.to <= adjustedPos.from) continue;
            }
          } catch (e) { continue; }

          // Check paragraph end boundary
          try {
            const $to = doc.resolve(adjustedPos.to);
            const paragraphStart = $to.start($to.depth);
            const paragraphEnd = paragraphStart + $to.node($to.depth).nodeSize;

            if (adjustedPos.to >= paragraphEnd - 1) continue;

            if (!hasLineBreakAfter(doc, adjustedPos.to, paragraphEnd)) {
              const textAfterMark = doc.textBetween(adjustedPos.to, Math.min(adjustedPos.to + 10, paragraphEnd - 1));
              if (!textAfterMark.trim() && adjustedPos.to >= paragraphEnd - 5) continue;
            }
          } catch (e) { continue; }

          markOps.push({ from: adjustedPos.from, to: adjustedPos.to, normalizedRef, noteId });
        } catch (e) {
          continue;
        }
      }
    }

    // Apply all mark operations in a single transaction (one view update)
    if (markOps.length > 0) {
      try {
        const tr = editor.state.tr;
        const markType = editor.state.schema.marks.scripturePill;
        const noteLinkMark = editor.state.schema.marks.noteLink;
        if (markType) {
          // Sort by position descending so earlier operations don't shift later positions
          markOps.sort((a, b) => b.from - a.from);
          for (const op of markOps) {
            tr.removeMark(op.from, op.to, markType);
            tr.addMark(op.from, op.to, markType.create({ reference: op.normalizedRef, noteId: op.noteId, translation: op.translation || null }));
            if (noteLinkMark) {
              tr.removeMark(op.from, op.to, noteLinkMark);
            }
          }
          editor.view.dispatch(tr);
        }
      } catch (e) {
        console.error('Error batching scripture pill marks:', e);
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
      const pillTranslation = (pillSpan as HTMLElement).getAttribute('data-scripture-translation') || null;
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
              tr.removeMark(adjustedPos.from, adjustedPos.to, markType);
              tr.addMark(adjustedPos.from, adjustedPos.to, markType.create({ reference: normalizedRef, noteId, translation: pillTranslation }));
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
              .setMark('scripturePill', { reference: normalizedRef, noteId, translation: pillTranslation })
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
              // Get translation from note's scripture metadata if available
              const noteTranslation = noteData.note?.scriptureVersion || noteData.note?.translation || getCachedProfileData()?.defaultTranslation || 'NET';

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
                      tr.removeMark(adjustedPos.from, adjustedPos.to, markType);
                      tr.addMark(adjustedPos.from, adjustedPos.to, markType.create({ reference: normalizedRef, noteId, translation: noteTranslation }));
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
                      .setMark('scripturePill', { reference: normalizedRef, noteId, translation: noteTranslation })
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
            tr.removeMark(adjustedPos.from, adjustedPos.to, markType);
            const userTranslation = getCachedProfileData()?.defaultTranslation || 'NET';
            tr.addMark(adjustedPos.from, adjustedPos.to, markType.create({ reference: normalizedRef, noteId: noteId || undefined, translation: userTranslation }));
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
          const userTranslation = getCachedProfileData()?.defaultTranslation || 'NET';
          editor.chain()
            .setTextSelection(adjustedPos)
            .unsetMark('noteLink')
            .setMark('scripturePill', { reference: normalizedRef, noteId: noteId || undefined, translation: userTranslation })
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
                
                // Ensure the cursor is visible by scrolling only the editor content area (not the window/sheet)
                try {
                  const coords = view.coordsAtPos(finalPos);
                  if (coords) {
                    const scrollEl = dom.closest('.tiptap-content') as HTMLElement | null;
                    if (scrollEl) {
                      const scrollRect = scrollEl.getBoundingClientRect();
                      if (coords.top < scrollRect.top) {
                        scrollEl.scrollTop -= scrollRect.top - coords.top;
                      } else if (coords.bottom > scrollRect.bottom) {
                        scrollEl.scrollTop += coords.bottom - scrollRect.bottom;
                      }
                      debug('[TiptapEditor] Scrolled cursor into view within editor', { finalPos, coords });
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

/**
 * Formatting toolbar button row. Browsers often skip CSS @keyframes that start on the same
 * frame the element mounts; we paint a prep state first, then arm after one rAF (prep already
 * separates commits — a second rAF was stacking delay on cold first paint vs warm title↔body focus).
 */
function TiptapToolbarTrack({
  placement,
  children,
}: {
  placement: 'top' | 'bottom';
  children: React.ReactNode;
}) {
  const [enterArmed, setEnterArmed] = useState(false);

  useLayoutEffect(() => {
    setEnterArmed(false);
    const raf1 = requestAnimationFrame(() => {
      setEnterArmed(true);
    });
    return () => {
      cancelAnimationFrame(raf1);
    };
  }, [placement]);

  const prepClass =
    placement === 'top' ? 'tiptap-toolbar__track--enter-prep-top' : 'tiptap-toolbar__track--enter-prep-bottom';
  const runClass =
    placement === 'top' ? 'tiptap-toolbar__track--enter-from-top' : 'tiptap-toolbar__track--enter-from-bottom';

  return (
    <div className={`tiptap-toolbar__track flex items-center w-full min-w-0 ${enterArmed ? runClass : prepClass}`}>
      {children}
    </div>
  );
}

// Detect mobile device for different handling
// On mobile, we don't want to interfere with native keyboard behavior (e.g., double-space-to-period)
const isMobileDevice = (): boolean => {
  if (typeof window === 'undefined') return false;
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
};

const TiptapEditor: React.FC<TiptapEditorProps> = ({
  content,
  id = "content",
  name = "content",
  placeholder = "Write something...",
  minimalToolbar = false,
  toolbarAtBottom = false,
  toolbarBottomMargin = 12,
  tabindex,
  onContentChange,
  scrollPosition,
  enableCreateNoteFromSelection = false,
  parentThreadId,
  sourceNoteId,
  onEditorReady,
  onEditorInstanceReady,
  inBottomSheet = false
}) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isEditorFocused, setIsEditorFocused] = useState(false);
  /** Bump when the editor gains focus from an unfocused state so the toolbar remounts and the enter animation can run. */
  const [toolbarEnterEpoch, setToolbarEnterEpoch] = useState(0);
  const editorWasFocusedForToolbarRef = useRef(false);
  const [activeStates, setActiveStates] = useState({
    bold: false,
    italic: false,
    underline: false,
    orderedList: false,
    bulletList: false,
    headingLevel: 0 // 0 = normal/paragraph, 2 = H2, 3 = H3
  });
  const [showCreateNoteButton, setShowCreateNoteButton] = useState(false);

  // Custom floating selection action bar (replaces BubbleMenu which has reliability issues across Tiptap versions)
  const [selectionActionBar, setSelectionActionBar] = useState<{
    top: number;
    left: number;
  } | null>(null);

  const [translationPicker, setTranslationPicker] = useState<{
    rect: { top: number; left: number; bottom: number; right: number; width: number };
    translation: string | null;
    noteId: string | null;
    reference: string;
    updating?: boolean; // true while API call is in flight
  } | null>(null);
  const [contentOverflowing, setContentOverflowing] = useState(false);
  const [contentHasScrolledDown, setContentHasScrolledDown] = useState(false);
  const [contentHasScrolledToBottom, setContentHasScrolledToBottom] = useState(false);
  const hiddenInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<any>(null);
  const tiptapContentRef = useRef<HTMLDivElement>(null);
  const createNoteBubbleRef = useRef<HTMLDivElement>(null);
  const mobileScriptureDetectionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // When in bottom sheet with keyboard open, scroll selection into view above the fixed toolbar (scroll-margin-bottom in CSS)
  const scrollSelectionIntoViewAboveToolbar = (editorInstance: any) => {
    if (!isEditorValid(editorInstance)) return;
    const sheet = document.querySelector('.bottom-sheet-content[data-keyboard-open]');
    if (!sheet) return;
    const { from } = editorInstance.state.selection;
    const { node } = editorInstance.view.domAtPos(from);
    if (node && typeof (node as HTMLElement).scrollIntoView === 'function') {
      (node as HTMLElement).scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
    }
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
      ScripturePill, // Must come before NoteLink so scripture pills are parsed correctly
      NoteLink,
      Placeholder.configure({
        placeholder: placeholder,
        showOnlyWhenEditable: true,
        showOnlyCurrent: true,
      }),
    ],
    content: content || '',
    onCreate: ({ editor }) => {
      if (onEditorReady) {
        onEditorReady(editor);
      }
      queueMicrotask(() => {
        try {
          if (!isEditorValid(editor)) return;
          if (editor.getHTML().includes('scripture-pill')) {
            placeCursorAfterLeadingScripturePill(editor);
          }
        } catch {
          /* ignore */
        }
      });
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

      // Auto-capitalize first letter (post-input transformation)
      // Only run when the cursor is near the start of the document to avoid
      // traversing doc.firstChild on every keystroke throughout the document.
      try {
        const { from: cursorPos } = editor.state.selection;
        // Only check when cursor is within the first 3 positions (typing at start)
        if (cursorPos <= 3) {
          const doc = editor.state.doc;
          const firstChild = doc.firstChild;
          if (firstChild && firstChild.isTextblock && firstChild.textContent.length >= 1) {
            const firstChar = firstChild.textContent[0];
            if (/^[a-z]$/.test(firstChar)) {
              const from = 1;
              const to = 2;
              editor.commands.command(({ tr, dispatch }) => {
                if (dispatch) {
                  tr.replaceWith(from, to, editor.state.schema.text(firstChar.toUpperCase()));
                  dispatch(tr);
                }
                return true;
              });
            }
          }
        }
      } catch (e) {
        // Silently ignore errors (e.g., empty document, destroyed editor)
      }

      // Mobile: detect scripture references after space, newline, or Return (new paragraph)
      // Desktop uses the space keydown handler; mobile uses onUpdate to avoid
      // intercepting keydown events which breaks iOS double-space-to-period.
      // We gate scheduling on word boundaries (or pending translation) so plain
      // typing does not constantly reset the debounce timer.
      if (isMobileDevice()) {
        const { from: mobFrom, to: mobTo } = editor.state.selection;
        if (mobFrom === mobTo && mobFrom >= 2) {
          const $mobFrom = editor.state.doc.resolve(mobFrom);
          const needsScripturePass =
            pendingTranslationPill !== null ||
            isScripturePillBoundaryCursor($mobFrom, editor.state.doc);
          if (!needsScripturePass) {
            if (mobileScriptureDetectionTimer.current) {
              clearTimeout(mobileScriptureDetectionTimer.current);
              mobileScriptureDetectionTimer.current = null;
            }
          } else {
            if (mobileScriptureDetectionTimer.current) {
              clearTimeout(mobileScriptureDetectionTimer.current);
            }
            mobileScriptureDetectionTimer.current = setTimeout(() => {
              if (!editor || editor.isDestroyed) return;
              try {
                // Step 1: Resolve pending translation (same order as desktop handleKeyDown)
                resolvePendingTranslationPill(editor);

                const { from, to } = editor.state.selection;
                if (from !== to) return;
                if (from < 2) return;
                const $from = editor.state.doc.resolve(from);
                if ($from.marks().some((m: any) => m.type.name === 'scripturePill')) return;

                if (!isScripturePillBoundaryCursor($from, editor.state.doc)) return;

                const textBeforeCursor = getTextBeforeCursorForScripture(editor);
                if (textBeforeCursor.trim().length === 0) return;

                const references = detectScriptureReferences(textBeforeCursor);
                if (references.length === 0) return;

                createPendingPillsForReferences(editor, references);
                schedulePendingTranslationAfterPillCreation(editor, references);
              } catch (e) {
                // Silently ignore errors
              }
            }, 250);
          }
        }
      }

      // Scroll cursor into view when content changes
      // Use rAF to batch with the browser's next paint instead of forcing layout synchronously
      requestAnimationFrame(() => {
        try {
          const view = editor.view;
          if (!view || editor.isDestroyed) return;
          const { from } = editor.state.selection;
          const coords = view.coordsAtPos(from);
          if (coords) {
            const editorDom = view.dom;
            const scrollContainer = editorDom.closest('.tiptap-content') || editorDom.closest('.card-stack__inner');
            if (scrollContainer) {
              const scrollRect = scrollContainer.getBoundingClientRect();
              // If cursor is below the visible area (with 80px buffer for footer)
              if (coords.bottom > scrollRect.bottom - 80) {
                scrollContainer.scrollTop += (coords.bottom - scrollRect.bottom + 100);
              }
            }
          }
        } catch (e) {
          // Silently ignore scroll errors
        }
      });
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
      handlePaste: (view, event, slice) => {
        const editor = editorRef.current;
        if (!editor) {
          return false;
        }

        // Check if editor is still valid (not destroyed)
        if (!isEditorValid(editor)) {
          return false;
        }

        // If selection starts inside a pill, don't add extra paste behavior
        // (let ProseMirror handle paste normally to avoid pill edge cases)
        try {
          const $from = view.state.selection.$from;
          const hasPillAtCursor = $from.marks().some((m: any) => m.type.name === 'scripturePill');
          if (hasPillAtCursor) {
            return false;
          }
        } catch (e) {
          // Ignore selection resolution issues and continue
        }

        // Try to get HTML from clipboard to check for existing scripture pills
        let pastedHTML = '';
        try {
          pastedHTML = (event as any)?.clipboardData?.getData?.('text/html') || '';
        } catch (e) {
          // ignore
        }

        // Extract scripture pills with noteIds from pasted HTML
        const existingPillsWithNoteIds = new Set<string>(); // Set of normalized references
        if (pastedHTML) {
          // Pattern 1: data-scripture-reference comes before data-note-id
          const pillPattern1 = /<span[^>]*data-scripture-reference\s*=\s*["']([^"']+)["'][^>]*data-note-id\s*=\s*["']([^"']+)["'][^>]*>/gi;
          let match;
          while ((match = pillPattern1.exec(pastedHTML)) !== null) {
            const reference = match[1];
            const noteId = match[2];
            // Only treat as existing if it has a real note ID (not "pending", not null, not empty)
            if (noteId && noteId !== 'pending' && noteId !== 'null' && noteId !== '') {
              const normalizedRef = normalizeScriptureReference(reference);
              existingPillsWithNoteIds.add(normalizedRef);
            }
          }

          // Pattern 2: data-note-id comes before data-scripture-reference
          const pillPattern2 = /<span[^>]*data-note-id\s*=\s*["']([^"']+)["'][^>]*data-scripture-reference\s*=\s*["']([^"']+)["'][^>]*>/gi;
          while ((match = pillPattern2.exec(pastedHTML)) !== null) {
            const noteId = match[1];
            const reference = match[2];
            // Only treat as existing if it has a real note ID (not "pending", not null, not empty)
            if (noteId && noteId !== 'pending' && noteId !== 'null' && noteId !== '') {
              const normalizedRef = normalizeScriptureReference(reference);
              existingPillsWithNoteIds.add(normalizedRef);
            }
          }
        }

        // Prefer clipboard plain text, fall back to Slice text
        let pastedText = '';
        try {
          pastedText = (event as any)?.clipboardData?.getData?.('text/plain') || '';
        } catch (e) {
          // ignore
        }

        if (!pastedText) {
          try {
            pastedText = slice?.content?.textBetween?.(0, slice.content.size, '\n\n') || '';
          } catch (e) {
            // ignore
          }
        }

        pastedText = (pastedText || '').trim();
        if (!pastedText) {
          return false;
        }

        // Detect references in pasted text
        const references = detectScriptureReferences(pastedText);
        if (!references || references.length === 0) {
          return false;
        }

        // We have references: handle paste ourselves, then create pills immediately
        try {
          (event as any)?.preventDefault?.();
        } catch (e) {
          // ignore
        }

        try {
          const tr = view.state.tr.replaceSelection(slice);
          tr.setStoredMarks([]);
          view.dispatch(tr);
        } catch (e) {
          // If our manual paste fails, fall back to default paste behavior
          return false;
        }

        // After pasting, check the document for pills with noteIds that were parsed from HTML
        // This handles cases where HTML wasn't available from clipboard but ProseMirror parsed it
        setTimeout(async () => {
          try {
            if (!editor || editor.isDestroyed) return;
            
            const doc = editor.state.doc;
            const htmlContent = editor.getHTML();
            
            // Also check the document after paste for pills with noteIds
            // This catches pills that ProseMirror parsed from the slice HTML
            const docPillPattern1 = /<span[^>]*data-scripture-reference\s*=\s*["']([^"']+)["'][^>]*data-note-id\s*=\s*["']([^"']+)["'][^>]*>/gi;
            let docMatch;
            while ((docMatch = docPillPattern1.exec(htmlContent)) !== null) {
              const reference = docMatch[1];
              const noteId = docMatch[2];
              if (noteId && noteId !== 'pending' && noteId !== 'null' && noteId !== '') {
                const normalizedRef = normalizeScriptureReference(reference);
                existingPillsWithNoteIds.add(normalizedRef);
              }
            }

            const docPillPattern2 = /<span[^>]*data-note-id\s*=\s*["']([^"']+)["'][^>]*data-scripture-reference\s*=\s*["']([^"']+)["'][^>]*>/gi;
            while ((docMatch = docPillPattern2.exec(htmlContent)) !== null) {
              const noteId = docMatch[1];
              const reference = docMatch[2];
              if (noteId && noteId !== 'pending' && noteId !== 'null' && noteId !== '') {
                const normalizedRef = normalizeScriptureReference(reference);
                existingPillsWithNoteIds.add(normalizedRef);
              }
            }

            // Also check ProseMirror marks directly for pills with noteIds
            // This is more reliable than HTML parsing
            doc.descendants((node: any, pos: number) => {
              if (node.marks) {
                node.marks.forEach((mark: any) => {
                  if (mark.type.name === 'scripturePill' && mark.attrs.noteId && 
                      mark.attrs.noteId !== 'pending' && mark.attrs.noteId !== 'null' && mark.attrs.noteId !== '') {
                    const normalizedRef = normalizeScriptureReference(mark.attrs.reference);
                    existingPillsWithNoteIds.add(normalizedRef);
                  }
                });
              }
            });

            // Filter out references that already have pills with noteIds
            const referencesNeedingPills = references.filter(ref => {
              const normalizedRef = normalizeScriptureReference(ref.reference);
              return !existingPillsWithNoteIds.has(normalizedRef);
            });

            // Only create pending pills for references that don't already have pills with noteIds
            if (referencesNeedingPills.length > 0) {
              createPendingPillsForReferences(editor, referencesNeedingPills);
              schedulePendingTranslationAfterPillCreation(editor, referencesNeedingPills);
            }

            // If editing an existing note, immediately process scripture references
            // This creates scripture notes instantly without requiring a save
            if (sourceNoteId && (referencesNeedingPills.length > 0 || references.length > 0)) {
              try {
                const currentHtml = editor.getHTML();
                const currentThreadId = parentThreadId || 'thread_unorganized';

                // Call API to process scripture references with current editor content
                const processResponse = await fetch(`/api/notes/${sourceNoteId}/process-scripture-references`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    threadId: currentThreadId,
                    contentOverride: currentHtml
                  }),
                  credentials: 'include'
                });

                if (processResponse.ok) {
                  const processResult = await processResponse.json();
                  
                  // Convert results to format expected by convertScriptureReferencesToPills
                  // Only include results where scripture notes were created or added (not skipped)
                  const scriptureResults = processResult.results
                    .filter((r: any) => r.action === 'created' || r.action === 'added')
                    .map((r: any) => ({
                      reference: r.reference,
                      noteId: r.noteId
                    }));

                  if (scriptureResults.length > 0) {
                    // Update pills with real noteIds
                    await convertScriptureReferencesToPills(editor, scriptureResults);
                  }
                } else {
                  console.error('[TiptapEditor] Error processing scripture references after paste:', processResponse.status);
                }
              } catch (processError) {
                // Non-critical error - scripture notes will be created on save
                console.error('[TiptapEditor] Error processing scripture references after paste:', processError);
              }
            }
          } catch (e) {
            console.error('[TiptapEditor] Error checking for existing pills after paste:', e);
            // Fallback: create pending pills for all references if check fails
            createPendingPillsForReferences(editor, references);
            schedulePendingTranslationAfterPillCreation(editor, references);
          }
        }, 0);

        return true;
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

        // EARLY CHECK: Handle Backspace/Delete adjacent to or inside a pill
        // This must fire first to prevent ProseMirror's default backspace from eating pill characters
        if ((event.key === 'Backspace' || event.key === 'Delete') && from === to) {
          if (scripturePillMark) {
            // Cursor is inside the pill — delete entire pill atomically
            const boundaries = findPillBoundaries(view.state.doc, from);
            if (boundaries) {
              event.preventDefault();
              editor.chain()
                .deleteRange({ from: boundaries.start, to: boundaries.end })
                .run();
              return true;
            }
          } else {
            // Cursor is outside — check if adjacent to a pill
            const direction = event.key === 'Backspace' ? 'before' : 'after';
            const adjacentBoundaries = findAdjacentPillBoundaries(view.state.doc, from, direction);
            if (adjacentBoundaries) {
              event.preventDefault();
              editor.chain()
                .deleteRange({ from: adjacentBoundaries.start, to: adjacentBoundaries.end })
                .run();
              return true;
            }
          }
        }
        
        // Detect scripture references when space or Enter is pressed (desktop only)
        // On mobile, scripture detection happens in onUpdate to avoid interfering
        // with native keyboard behavior (e.g., iOS double-space-to-period)
        const isSpaceOrEnterKey =
          event.key === ' ' || event.key === 'Enter' || event.key === 'NumpadEnter';
        if (isSpaceOrEnterKey && from === to && !scripturePillMark && !event.metaKey && !event.ctrlKey && !event.altKey && !isMobileDevice()) {
          // Step 1: Resolve any pending translation pill from a previous keypress
          // (Check if user typed a translation abbreviation like "ESV" after the last pill)
          const consumedAbbrev = resolvePendingTranslationPill(editor);
          if (consumedAbbrev) {
            if (event.key === ' ') {
              event.preventDefault();
              const tr = view.state.tr;
              tr.insertText(' ', view.state.selection.from);
              tr.setStoredMarks([]);
              view.dispatch(tr);
              return true;
            }
            // For Enter / NumpadEnter, let the newline happen naturally
          }

          // Step 2: Detect new scripture references before cursor
          const doc = view.state.doc;
          const cursorPos = view.state.selection.from;
          const textStart = Math.max(0, cursorPos - 60);
          const textBeforeCursor = doc.textBetween(textStart, cursorPos);

          try {
            if (textBeforeCursor.trim().length > 0) {
              const references = detectScriptureReferences(textBeforeCursor);
              if (references.length > 0) {
                if (event.key === ' ') {
                  // On desktop: Synchronously handle the space and the pill creation
                  event.preventDefault();

                  // Create a single transaction for the space insertion
                  const tr = view.state.tr;
                  tr.insertText(' ', view.state.selection.from);
                  tr.setStoredMarks([]);
                  view.dispatch(tr);

                  // Create pills without translation (deferred — will resolve on next space/Enter or timeout)
                  createPendingPillsForReferences(editor, references);
                  schedulePendingTranslationAfterPillCreation(editor, references);
                  return true;
                }

                // Enter / NumpadEnter: must not wrap text in a pill before ProseMirror runs splitBlock,
                // or the paragraph break never inserts. Defer to a microtask so the newline runs first.
                queueMicrotask(() => {
                  if (!isEditorValid(editor)) return;
                  createPendingPillsForReferences(editor, references);
                  schedulePendingTranslationAfterPillCreation(editor, references);
                });
              }
            }
          } catch (e) {
            console.error('[TiptapEditor] Error in space/enter detection:', e);
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
                // On mobile: Don't interfere with native keyboard behavior
                // Let the space be handled naturally for double-space-to-period, etc.
                if (isMobileDevice()) {
                  // Just move cursor to end of pill, let native handle the space
                  editor.chain()
                    .setTextSelection(boundaries.end)
                    .unsetAllMarks()
                    .run();
                  return false; // Let native keyboard handle the space
                }

                // On desktop: manually handle the space
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

        // Auto-capitalize first letter is now handled via onUpdate handler below
        // (using post-input transformation instead of keydown prevention to avoid
        // race conditions with mobile keyboards that cause double letters like "Wwhenever")

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
  }, [editor, id]);

  // Update content from props, but only if it's different and editor is not focused
  // Exception: new-note panel can hydrate prefill from localStorage after the editor mounts empty;
  // onEditorReady may already have focused, so we must still setContent when editor.isEmpty.
  useEffect(() => {
    if (!editor || !content) return;

    if (!isEditorValid(editor)) return;

    const currentContent = editor.getHTML();
    if (currentContent === content) return;

    const isNewNoteEditor = id === 'new-note-content';
    const shouldForceHydratePrefill =
      isNewNoteEditor && editor.isEmpty && content.trim().length > 0;

    if (editor.isFocused && !shouldForceHydratePrefill) {
      return;
    }

    editor.commands.setContent(content, { emitUpdate: false });

    const needsCursorAfterScripturePill =
      isNewNoteEditor && content.includes('scripture-pill');

    const cursorTimeout = setTimeout(() => {
      if (!isEditorValid(editor)) return;
      try {
        if (needsCursorAfterScripturePill) {
          placeCursorAfterLeadingScripturePill(editor);
          editor.commands.focus();
        } else if (!editor.isFocused) {
          const doc = editor.state.doc;
          const endPos = doc.content.size;
          editor.commands.setTextSelection(endPos);
        }
        snapCursorOutsideScripturePill(editor);
      } catch {
        /* ignore */
      }
    }, 100);

    const conversionTimeout = setTimeout(async () => {
      if (isEditorValid(editor)) {
        await convertNoteLinksToScripturePills(editor);
      }
    }, 500);

    return () => {
      clearTimeout(cursorTimeout);
      clearTimeout(conversionTimeout);
    };
  }, [editor, content, id]);

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

  // Selection detection for create note button + floating action bar positioning
  useEffect(() => {
    if (!editor || !enableCreateNoteFromSelection) {
      setShowCreateNoteButton(false);
      setSelectionActionBar(null);
      return;
    }

    const updateSelection = () => {
      // Check if editor is still valid before accessing it
      if (!isEditorValid(editor)) {
        setShowCreateNoteButton(false);
        setSelectionActionBar(null);
        return;
      }
      if (isValidSelection(editor)) {
        setShowCreateNoteButton(true);
        // Position floating action bar below the selection (same as translation picker)
        try {
          const { view } = editor;
          const { from, to } = view.state.selection;
          const start = view.coordsAtPos(from);
          const end = view.coordsAtPos(to);
          // Place below the selection, centered horizontally
          const top = Math.max(start.bottom, end.bottom) + 6;
          const left = (start.left + end.left) / 2;
          setSelectionActionBar({ top, left });
        } catch (_) {
          setSelectionActionBar(null);
        }
      } else {
        setShowCreateNoteButton(false);
        setSelectionActionBar(null);
      }
    };

    editor.on('selectionUpdate', updateSelection);

    // Also dismiss on blur/click outside
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target?.closest?.('.selection-action-bar')) return;
      // Give a tick for the selection to update before dismissing
      setTimeout(() => {
        if (!isEditorValid(editor)) return;
        if (!isValidSelection(editor)) {
          setSelectionActionBar(null);
          setShowCreateNoteButton(false);
        }
      }, 100);
    };

    document.addEventListener('mousedown', handleMouseDown);

    return () => {
      if (editor && !editor.isDestroyed) {
        editor.off('selectionUpdate', updateSelection);
      }
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, [editor, enableCreateNoteFromSelection]);

  // Handle ALL scripture pill clicks via DOM click handler (both edit and read-only).
  // We use the CAPTURE phase on the wrapper div so our handler fires BEFORE
  // ProseMirror's internal click processing. user-select:none on pill spans
  // causes ProseMirror to report positions outside the mark boundary, making its
  // handleClick unreliable for pills. This DOM handler bypasses that entirely.
  //   Edit mode → show translation picker
  //   Read-only → navigate to the scripture note
  useEffect(() => {
    if (!editor) return;
    const wrapperDiv = tiptapContentRef.current;
    if (!wrapperDiv) return;

    const handlePillClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const pillSpan = target.closest('.scripture-pill') as HTMLElement;
      if (!pillSpan) return;

      // Read pill data from DOM attributes
      const reference = pillSpan.getAttribute('data-scripture-reference');
      const translation = pillSpan.getAttribute('data-scripture-translation');
      const noteId = pillSpan.getAttribute('data-note-id');
      if (!reference) return;

      // Stop ProseMirror from processing this click
      e.preventDefault();
      e.stopImmediatePropagation();

      if (editor.isEditable) {
        // Edit mode: show translation picker
        const rect = pillSpan.getBoundingClientRect();
        setTranslationPicker({
          rect: { top: rect.top, left: rect.left, bottom: rect.bottom, right: rect.right, width: rect.width },
          translation,
          noteId,
          reference,
        });
      } else {
        // Read-only mode: navigate to the scripture note
        if (!noteId || noteId === 'pending' || noteId === 'null') return;

        // Determine thread context from URL/cache/DOM
        let threadContext: string | undefined;
        try {
          const fromQuery = new URLSearchParams(window.location.search).get('thread');
          if (fromQuery && fromQuery.startsWith('thread_')) {
            threadContext = fromQuery;
          }
        } catch {
          // ignore
        }
        const currentNoteId = extractIdFromPath(window.location.pathname);
        if (!threadContext && currentNoteId?.startsWith('note_')) {
          try {
            const cached = localStorage.getItem(`harvous-note-thread-${currentNoteId}`);
            if (cached && cached.startsWith('thread_')) {
              threadContext = cached;
            }
          } catch {
            // ignore
          }
        }
        const noteElement = document.querySelector('[data-note-id]') as HTMLElement;
        if (!threadContext && noteElement?.dataset.parentThreadId) {
          threadContext = noteElement.dataset.parentThreadId;
        } else {
          const navElement = document.querySelector('[slot="navigation"]') as HTMLElement;
          if (!threadContext && navElement?.dataset.parentThreadId) {
            threadContext = navElement.dataset.parentThreadId;
          } else {
            const pathname = window.location.pathname;
            if (pathname && pathname !== '/' && !pathname.includes('/dashboard') &&
                !pathname.includes('/sign-in') && !pathname.includes('/sign-up')) {
              const itemId = extractIdFromPath(pathname);
              if (itemId && itemId !== 'dashboard' &&
                  !itemId.startsWith('note_') && !itemId.startsWith('space_')) {
                threadContext = itemId;
              }
            }
          }
        }

        // Push current note onto nav stack for breadcrumb-style back navigation
        if (currentNoteId?.startsWith('note_') && threadContext) {
          pushNavStack(currentNoteId, threadContext);
        }
        const fullNoteId = noteId.startsWith('note_') ? noteId : `note_${noteId}`;
        if (threadContext && threadContext !== 'thread_unorganized') {
          fetch(`/api/notes/${fullNoteId}/add-thread`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ threadId: threadContext }),
            credentials: 'include',
          })
            .then((res) => {
              if (res.ok) {
                window.dispatchEvent(
                  new CustomEvent('noteAddedToThread', {
                    detail: { noteId: fullNoteId, threadId: threadContext, source: 'inlineAddThread' },
                  })
                );
              }
            })
            .catch(() => {});
        }
        const url = idToUrl(fullNoteId, threadContext, currentNoteId || undefined);
        safeNavigate(url);
      }
    };

    const handleDismiss = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.scripture-translation-picker') && !target.closest('.scripture-pill')) {
        setTranslationPicker(null);
      }
    };

    // Use capture phase so we intercept pill clicks before ProseMirror
    wrapperDiv.addEventListener('click', handlePillClick, true);
    document.addEventListener('mousedown', handleDismiss);
    return () => {
      wrapperDiv.removeEventListener('click', handlePillClick, true);
      document.removeEventListener('mousedown', handleDismiss);
    };
  }, [editor]);

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
      // Serialize from the ProseMirror doc so scripture pills (user-select:none in DOM) are not dropped
      // (range.cloneContents() omits non-selectable nodes).
      try {
        const slice = editor.state.doc.slice(from, to);
        const serializer = DOMSerializer.fromSchema(editor.schema);
        const fragment = serializer.serializeFragment(slice.content);
        const tempDiv = document.createElement('div');
        tempDiv.appendChild(fragment);
        extractedContent = tempDiv.innerHTML;
      } catch (e) {
        extractedContent = editor.state.doc.textBetween(from, to);
      }
    } else {
      // Plain text - use textBetween
      extractedContent = editor.state.doc.textBetween(from, to);
    }
    
    const plainText = extractedContent.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    const MAX_SELECTION_LENGTH_FOR_TITLE = 20;
    const putSelectionInTitle = plainText.length > 0 && plainText.length < MAX_SELECTION_LENGTH_FOR_TITLE;

    // Detect if this is scripture
    try {
      if (plainText.length >= 5) {
        const detectResponse = await fetch('/api/scripture/detect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: plainText }),
          credentials: 'include'
        });

        if (detectResponse.ok) {
          const detection = await detectResponse.json();
          
          // Only enter the scripture-specific flow when the selection is primarily a
          // reference (e.g. "Romans 8:28"), not a broader passage that happens to contain one
          // (e.g. "centered around Proverbs 25:2 to build a tool").
          const refPattern = new RegExp(detection.primaryReference?.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') || '', 'i');
          const textBeyondRef = detection.primaryReference ? plainText.replace(refPattern, '').trim() : plainText;
          const isJustScriptureRef = textBeyondRef.length <= 15;

          if (detection.isScripture && detection.confidence >= 0.7 && detection.primaryReference && isJustScriptureRef) {
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
                      
                      // Create hyperlink only if the selection isn't already a scripture pill
                      // (pills already link to the note — overlaying a noteLink would fail or corrupt markup)
                      const { from, to } = editor.state.selection;
                      const pillMark = editor.schema.marks.scripturePill;
                      const selectionIsPill = pillMark && editor.state.doc.rangeHasMark(from, to, pillMark);
                      if (!selectionIsPill) {
                        const plainTextForMatching = editor.state.doc.textBetween(from, to, ' ');
                        window.dispatchEvent(new CustomEvent('createHyperlink', {
                            detail: {
                                sourceNoteId,
                                newNoteId: existingCheck.noteId,
                                from,
                                to,
                                plainText: plainTextForMatching || null,
                            }
                        }));
                      }
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
                        
                        // Create hyperlink only if the selection isn't already a scripture pill
                        const { from, to } = editor.state.selection;
                        const pillMark2 = editor.schema.marks.scripturePill;
                        const selectionIsPill2 = pillMark2 && editor.state.doc.rangeHasMark(from, to, pillMark2);
                        if (!selectionIsPill2) {
                          const plainTextForMatching = editor.state.doc.textBetween(from, to, ' ');
                          window.dispatchEvent(new CustomEvent('createHyperlink', {
                              detail: {
                                  sourceNoteId,
                                  newNoteId: existingCheck.noteId,
                                  from,
                                  to,
                                  plainText: plainTextForMatching || null,
                              }
                          }));
                        }
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
                localStorage.setItem('newNoteScriptureVersion', getCachedProfileData()?.defaultTranslation || 'NET');
                localStorage.setItem('newNoteScriptureText', verseData.text);
                localStorage.setItem('newNoteTitle', detection.primaryReference); // Reference becomes title
                localStorage.setItem('newNoteContent', verseData.text); // Verse text becomes content
              } else {
                // Detection succeeded but verse fetch failed - still mark as scripture
                localStorage.setItem('newNoteType', 'scripture');
                localStorage.setItem('newNoteScriptureReference', detection.primaryReference);
                localStorage.setItem('newNoteScriptureVersion', getCachedProfileData()?.defaultTranslation || 'NET');
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
            if (putSelectionInTitle) {
              localStorage.setItem('newNoteTitle', plainText);
              localStorage.setItem('newNoteContent', '');
              localStorage.setItem('newNoteContentEmptyFromSelection', 'true');
            } else {
              localStorage.setItem('newNoteContent', extractedContent);
            }
          }
        }
      } else {
        // Too short to check - store in title if short, else content
        if (putSelectionInTitle) {
          localStorage.setItem('newNoteTitle', plainText);
          localStorage.setItem('newNoteContent', '');
          localStorage.setItem('newNoteContentEmptyFromSelection', 'true');
        } else {
          localStorage.setItem('newNoteContent', extractedContent);
        }
      }
    } catch (error) {
      // Continue anyway - don't block note creation
      if (putSelectionInTitle) {
        localStorage.setItem('newNoteTitle', plainText);
        localStorage.setItem('newNoteContent', '');
        localStorage.setItem('newNoteContentEmptyFromSelection', 'true');
      } else {
        localStorage.setItem('newNoteContent', extractedContent);
      }
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

  // Note-link clicks are handled by TiptapNoteLink ProseMirror plugin (handleClick + .note-link span).

  // Track editor focus state
  useEffect(() => {
    if (!editor) return;

    const handleFocus = () => {
      // Check if editor is still valid
      if (!isEditorValid(editor)) return;
      
      if (inBottomSheet && toolbarAtBottom) {
        // In sheet with bottom toolbar: after keyboard-open is set, scroll selection into view above toolbar
        setTimeout(() => scrollSelectionIntoViewAboveToolbar(editor), 350);
      } else {
        // Prevent unwanted scroll jumps on mobile by maintaining scroll position
        const editorElement = editor.view.dom;
        const contentContainer = editorElement?.closest('.tiptap-content') as HTMLElement;
        if (contentContainer) {
          const scrollTop = contentContainer.scrollTop;
          requestAnimationFrame(() => {
            if (contentContainer && Math.abs(contentContainer.scrollTop - scrollTop) > 10) {
              contentContainer.scrollTop = scrollTop;
            }
          });
        }
      }

      if (!editorWasFocusedForToolbarRef.current) {
        setToolbarEnterEpoch((n) => n + 1);
      }
      editorWasFocusedForToolbarRef.current = true;
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
          editorWasFocusedForToolbarRef.current = false;
          setIsEditorFocused(false);
        }
      }, 100);
    };

    editor.on('focus', handleFocus);
    editor.on('blur', handleBlur);

    const handleSelectionUpdate = () => {
      if (inBottomSheet && toolbarAtBottom) scrollSelectionIntoViewAboveToolbar(editor);
    };
    editor.on('selectionUpdate', handleSelectionUpdate);

    // Set initial focus state (mount with cursor already in editor — still show toolbar + animation)
    if (isEditorValid(editor) && editor.isFocused) {
      editorWasFocusedForToolbarRef.current = true;
      setToolbarEnterEpoch((n) => n + 1);
      setIsEditorFocused(true);
    } else if (isEditorValid(editor)) {
      setIsEditorFocused(false);
    }

    return () => {
      if (editor && !editor.isDestroyed) {
        editor.off('focus', handleFocus);
        editor.off('blur', handleBlur);
        editor.off('selectionUpdate', handleSelectionUpdate);
      }
    };
  }, [editor, inBottomSheet, toolbarAtBottom]);

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

  const syncTiptapContentScrollMask = useCallback(() => {
    const el = tiptapContentRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    const overflowing = scrollHeight > clientHeight + 1;
    setContentOverflowing(overflowing);
    setContentHasScrolledDown(scrollTop > 0);
    setContentHasScrolledToBottom(scrollTop + clientHeight >= scrollHeight - 2);
  }, []);

  /* Top/bottom fade masks: keep overflow + scroll flags in sync (CardFullEditable flex layout often settles after first paint). */
  useEffect(() => {
    if (!editor) return;
    const el = tiptapContentRef.current;
    if (!el) return;
    syncTiptapContentScrollMask();
    const timer = setTimeout(syncTiptapContentScrollMask, 50);
    const raf = requestAnimationFrame(syncTiptapContentScrollMask);
    editor.on('update', syncTiptapContentScrollMask);
    el.addEventListener('scroll', syncTiptapContentScrollMask, { passive: true });
    const ro = new ResizeObserver(syncTiptapContentScrollMask);
    ro.observe(el);
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(raf);
      if (editor && !editor.isDestroyed) {
        editor.off('update', syncTiptapContentScrollMask);
      }
      el.removeEventListener('scroll', syncTiptapContentScrollMask);
      ro.disconnect();
    };
  }, [editor, content, isEditorFocused, minimalToolbar, toolbarAtBottom, syncTiptapContentScrollMask]);

  // Create Note bubble menu: ensure its root has higher z-index than the sticky toolbar (z-index 10)
  useLayoutEffect(() => {
    const wrapper = createNoteBubbleRef.current;
    if (wrapper?.parentElement) {
      wrapper.parentElement.style.zIndex = '100';
    }
  }, []);

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
    <div className="tiptap-editor-container flex flex-col flex-1 min-h-0 w-full" style={{ minHeight: 0, height: '100%' }}>
      {/* Hidden input for form submission */}
      <input
        ref={hiddenInputRef}
        type="hidden"
        id={id}
        name={name}
        value={editor.getHTML()}
      />
      
      {/* Toolbar above or below scroll area; below keeps it visible above keyboard on mobile */}
      {!minimalToolbar && isEditorFocused && !toolbarAtBottom && (
        <div
          className="tiptap-toolbar p-1 border border-[var(--color-fog-white)] rounded-xl bg-[var(--color-snow-white)] shrink-0"
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 20,
            marginBottom: '12px',
            backgroundColor: 'var(--color-snow-white)',
          }}
        >
          <div className="tiptap-toolbar__hscroll">
          <TiptapToolbarTrack key={toolbarEnterEpoch} placement="top">
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
          </TiptapToolbarTrack>
          </div>
        </div>
      )}
      {/* Scroll area with top/bottom fade mask; toolbar is outside so not faded */}
      <div
        ref={tiptapContentRef}
        className={`tiptap-content flex-1 min-h-0 overflow-auto relative ${contentOverflowing && !contentHasScrolledToBottom ? 'tiptap-content--bottom-fade' : ''} ${contentOverflowing && contentHasScrolledDown ? 'tiptap-content--top-fade' : ''}`}
        onClick={(e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
          if (editor) {
            editor.commands.focus();
          }
        }}
      >
        <EditorContent editor={editor} />
        {/* Custom floating selection action bar — positioned via selectionUpdate event */}
        {/* Uses createPortal like the translation picker for reliable positioning */}
        {selectionActionBar && enableCreateNoteFromSelection && createPortal(
          <div
            ref={createNoteBubbleRef}
            data-harvous-bottom-sheet-floating=""
            className="selection-action-bar floating-picker-enter"
            style={{
              position: 'fixed',
              top: selectionActionBar.top,
              left: selectionActionBar.left,
              transform: 'translateX(-50%)',
              zIndex: 99999,
              pointerEvents: 'auto',
              display: 'flex',
              gap: '4px',
              padding: '4px',
              borderRadius: '10px',
              backgroundColor: 'var(--color-snow-white)',
              boxShadow: '0 1px 6px rgba(0,0,0,0.08), 0 4px 16px rgba(0,0,0,0.06)',
            }}
            onMouseDown={(e) => e.preventDefault()}
          >
            <button
              className="selection-action-btn"
              onMouseDown={(e: React.MouseEvent) => {
                e.preventDefault();
                e.stopPropagation();
                handleCreateNoteFromSelection();
                setSelectionActionBar(null);
              }}
              type="button"
              title="Create note from selection"
            >
              <Icon name="note-sticky" size={12} />
              Create Note
            </button>
            <button
              className="selection-action-btn"
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!editor) return;
                const { from, to } = editor.state.selection;
                if (from === to) return;
                const text = editor.state.doc.textBetween(from, to);
                navigator.clipboard.writeText(text).then(() => {
                  if (window.toast) window.toast.info('Copied to clipboard');
                }).catch(() => {});
                setSelectionActionBar(null);
              }}
              type="button"
              title="Copy selection"
            >
              <Icon name="copy" size={12} />
              Copy
            </button>
          </div>,
          document.body
        )}
        {/* Custom floating translation picker — positioned via pill click event, not BubbleMenu */}
        {/* BubbleMenu can't detect non-inclusive marks at cursor boundary positions */}
        {translationPicker && createPortal(
          <div
            data-harvous-bottom-sheet-floating=""
            className="scripture-translation-picker floating-picker-enter"
            style={{
              position: 'fixed',
              top: translationPicker.rect.bottom + 6,
              left: Math.max(8, translationPicker.rect.left + (translationPicker.rect.width / 2) - 160),
              zIndex: 99999,
              pointerEvents: 'auto',
              padding: '4px 0',
              borderRadius: '10px',
              backgroundColor: 'var(--color-snow-white)',
              boxShadow: '0 1px 6px rgba(0,0,0,0.08), 0 4px 16px rgba(0,0,0,0.06)',
              maxWidth: '216px',
              overflow: 'hidden',
            }}
            onMouseDown={(e) => e.preventDefault()}
          >
            <div
              ref={(el) => {
                if (!el) return;
                const selected = el.querySelector('.translation-picker-badge--selected') as HTMLElement;
                if (selected) {
                  requestAnimationFrame(() => {
                    selected.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'instant' });
                  });
                }
              }}
              style={{
                display: 'flex',
                gap: '4px',
                overflowX: 'auto',
                scrollbarWidth: 'none',
                padding: '0 4px',
              }}
            >
            {TRANSLATION_ORDER.map((tid) => {
              const currentTranslation = translationPicker.translation || getCachedProfileData()?.defaultTranslation || 'NET';
              const isSelected = currentTranslation === tid;
              return (
                <button
                  key={tid}
                  className={`translation-picker-badge${isSelected ? ' translation-picker-badge--selected' : ''}`}
                  style={translationPicker.updating && !isSelected ? { opacity: 0.4, pointerEvents: 'none' } : undefined}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!editor || isSelected || translationPicker.updating) return;

                    // Find the pill mark by matching reference and update its translation
                    try {
                      const doc = editor.state.doc;
                      const targetRef = translationPicker.reference;
                      let pillFrom = -1, pillTo = -1, existingMark: any = null;
                      doc.descendants((node: any, nodePos: number) => {
                        if (pillFrom !== -1) return false;
                        if (!node.isText) return;
                        const mark = node.marks.find((m: any) =>
                          m.type.name === 'scripturePill' &&
                          normalizeScriptureReference(m.attrs.reference) === normalizeScriptureReference(targetRef)
                        );
                        if (mark) {
                          pillFrom = nodePos;
                          pillTo = nodePos + node.nodeSize;
                          existingMark = mark;
                          return false;
                        }
                      });

                      if (pillFrom !== -1 && existingMark) {
                        const markType = editor.state.schema.marks.scripturePill;
                        const tr = editor.state.tr;
                        tr.removeMark(pillFrom, pillTo, markType);
                        tr.addMark(pillFrom, pillTo, markType.create({
                          ...existingMark.attrs,
                          translation: tid,
                        }));
                        editor.view.dispatch(tr);

                        // Update picker state: reflect new selection and mark as updating
                        setTranslationPicker(prev => prev ? { ...prev, translation: tid, updating: true } : null);

                        // Await the API call so the scripture note is ready before the user navigates to it
                        const noteId = existingMark.attrs.noteId;
                        if (noteId && noteId !== 'pending' && noteId !== 'null') {
                          fetch('/api/scripture/update-translation', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ noteId, newTranslation: tid }),
                            credentials: 'include',
                          })
                            .then(() => {
                              // Invalidate React Query cache for this scripture note
                              // so navigating to it shows the updated translation immediately
                              window.dispatchEvent(new CustomEvent('noteUpdated', { detail: { noteId } }));
                              setTranslationPicker(prev => prev ? { ...prev, updating: false } : null);
                            })
                            .catch(() => {
                              setTranslationPicker(prev => prev ? { ...prev, updating: false } : null);
                            });
                        } else {
                          // No API call needed — just clear the loading state
                          setTranslationPicker(prev => prev ? { ...prev, updating: false } : null);
                        }
                      }
                    } catch (err) {
                      console.error('[TranslationPicker] Error updating pill:', err);
                      setTranslationPicker(prev => prev ? { ...prev, updating: false } : null);
                    }
                  }}
                  type="button"
                >
                  {TRANSLATIONS[tid]?.abbreviation || tid}
                </button>
              );
            })}
            </div>
          </div>,
          document.body
        )}
      </div>
      {!minimalToolbar && isEditorFocused && toolbarAtBottom && (
        <div
          className="tiptap-toolbar tiptap-toolbar--bottom p-1 border border-[var(--color-fog-white)] rounded-xl bg-[var(--color-snow-white)] shrink-0"
          style={{
            position: 'sticky',
            bottom: 0,
            zIndex: 20,
            marginBottom: `${toolbarBottomMargin}px`,
            backgroundColor: 'var(--color-snow-white)',
          }}
        >
          <div className="tiptap-toolbar__hscroll">
          <TiptapToolbarTrack key={toolbarEnterEpoch} placement="bottom">
          <ToolbarButton
            onClick={() => {
              if (!editor) return;
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
              if (!editor) return;
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
              if (!editor) return;
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
              if (!editor) return;
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
              if (!editor) return;
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
              if (!editor) return;
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
              if (!editor) return;
              editor.chain().focus().clearNodes().unsetAllMarks().run();
            }}
            isActive={false}
            title="clean"
            ariaLabel="Clear formatting"
          >
            <Icon name="eraser" size={20} style={{ fill: 'currentColor' }} />
          </ToolbarButton>
          </TiptapToolbarTrack>
          </div>
        </div>
      )}
    </div>
  );
};

export default TiptapEditor;
