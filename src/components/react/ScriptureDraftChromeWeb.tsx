'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '@tiptap/core';
import {
  confirmScriptureDraftView,
  confirmAnyScriptureDraftView,
  getScriptureDraftRange,
  getScriptureDraftAnchorPos,
  getScriptureDraftAnchorElement,
  canSafelyResyncMobileDraftIdleCaret,
  resyncMobileCaret,
  getScriptureDraftValidity,
} from './TiptapScriptureDraft';
import { isTiptapViewReady } from '@/utils/tiptap-helpers';
import { onProtoViewportSettle } from '@/utils/proto-viewport-settle';
import { mapSliceIndexToDocPos, scriptureSliceStart } from '@/utils/scripture-pill-position';
import { suggestBooksForTypedReference } from '@/utils/scripture-book-suggest';

interface DraftConfirmState {
  top: number;
  left: number;
  to: number;
  /** Set when the reference parses but doesn't resolve against the canon — the ✓ won't commit. */
  invalidReason: string | null;
}

interface BookSuggestionState {
  /** Doc range of the typed book — the only text an accept rewrites. */
  from: number;
  to: number;
  typedBook: string;
  tail: string;
  books: string[];
  top: number;
  left: number;
  /** Not enough room above the line (top of the viewport) — sit below it instead. */
  below: boolean;
}

export interface ScriptureDraftChromeWebProps {
  editor: Editor;
}

/**
 * Everything that floats beside an inline scripture draft (prototype): the ✓ confirm, and —
 * before a draft exists — a "Did you mean John 3:16?" row for a reference the detector can't
 * read (`joh 3:16`). Accepting rewrites only the book; the normal detection then drafts it.
 *
 * Rendered OUTSIDE the editor, as portals — an inline contentEditable=false widget at the draft
 * blocks iOS text entry next to it. Every control here takes `pointerdown` with preventDefault so
 * the caret never leaves the draft.
 */
export default function ScriptureDraftChromeWeb({ editor }: ScriptureDraftChromeWebProps) {
  const [confirm, setConfirm] = useState<DraftConfirmState | null>(null);
  const [bookSuggestion, setBookSuggestion] = useState<BookSuggestionState | null>(null);
  const bookSuggestionRef = useRef<BookSuggestionState | null>(null);
  bookSuggestionRef.current = bookSuggestion;
  /** Escape hides the row for this typed book until it changes. Keyed `${from}:${typedBook}`. */
  const dismissedBookKeyRef = useRef<string | null>(null);

  const acceptBook = (book: string) => {
    const s = bookSuggestionRef.current;
    if (!s || !isTiptapViewReady(editor)) return;
    const { state } = editor;
    // The doc moved since the row was measured — don't rewrite the wrong text.
    if (state.doc.textBetween(s.from, s.to) !== s.typedBook) {
      setBookSuggestion(null);
      return;
    }
    editor.view.dispatch(state.tr.insertText(book, s.from, s.to));
    setBookSuggestion(null);
  };

  // Position the floating ✓ confirm just past the draft end (coordsAtPos), kept in sync with
  // edits, scroll, and the iOS keyboard (visualViewport).
  useEffect(() => {
    const updatePos = () => {
      if (!isTiptapViewReady(editor)) {
        setConfirm(null);
        return;
      }
      const to = getScriptureDraftAnchorPos(editor.state);
      if (to == null) {
        setConfirm(null);
        return;
      }
      try {
        const vw = typeof window !== 'undefined' ? window.innerWidth : 9999;
        // iOS: getBoundingClientRect()/coordsAtPos() are relative to the visual viewport, but the
        // portal button is position:fixed (layout viewport). While the keyboard is up,
        // visualViewport.offsetTop > 0, so without this correction the ✓ renders ~a line too high.
        const vv = typeof window !== 'undefined' ? window.visualViewport : null;
        const ox = vv?.offsetLeft ?? 0;
        const oy = vv?.offsetTop ?? 0;
        // Anchor the ✓ to the draft pill's DOM rect so it sits inline beside the pill —
        // vertically centered on the pill, flush to its right edge. coordsAtPos returns a thin
        // caret box that on iOS renders the button above the taller inline-flex pill.
        // Ask the same helper `confirmScriptureDraftView` gates on, so the button can never
        // disagree with what the commit will actually do. Only 'invalid' is surfaced — 'pending'
        // is ordinary mid-typing and must not look like an error.
        const commitState = getScriptureDraftValidity(editor.state, to);
        const invalidReason = commitState.status === 'invalid' ? commitState.reason : null;
        const draftEl = getScriptureDraftAnchorElement(editor.view, to);
        if (draftEl) {
          // The draft is `display: inline`, so if the reference wraps across a line
          // getBoundingClientRect() returns the UNION of its fragments — anchoring to that would
          // put the ✓ at the end of the first line. The last client rect is the trailing fragment,
          // which is where the caret and the next typed character actually are.
          const rects = draftEl.getClientRects();
          const rect = rects.length > 0 ? rects[rects.length - 1] : draftEl.getBoundingClientRect();
          setConfirm({
            to,
            invalidReason,
            top: rect.top + rect.height / 2 + oy,
            left: Math.min(rect.right + 6, vw - 30) + ox,
          });
          return;
        }
        // Fallback: the caret coordinate at the draft end.
        const coords = editor.view.coordsAtPos(to);
        setConfirm({
          to,
          invalidReason,
          top: (coords.top + coords.bottom) / 2 + oy,
          left: Math.min(coords.right + 6, vw - 30) + ox,
        });
      } catch {
        setConfirm(null);
      }
    };

    const updateBookSuggestion = () => {
      const next = computeBookSuggestion(editor, dismissedBookKeyRef.current);
      setBookSuggestion(next);
    };

    const updateAll = () => {
      updatePos();
      updateBookSuggestion();
    };

    // Hide the ✓ while actively typing — it sits at the draft's right edge, exactly where the next
    // character lands, so leaving it up covers the char being typed. Re-show + reposition once the
    // user pauses (same idle cadence as the mobile draft grow), so it reappears at the grown pill.
    let lastTypeAt = 0;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    const onDocUpdate = () => {
      lastTypeAt = Date.now();
      setConfirm(null);
      setBookSuggestion(null);
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        idleTimer = null;
        updateAll();
        // Measure again on the next frame: showing the ✓ is the moment the draft's inline box has
        // just settled, and a sub-frame layout shift (fonts, the chrome row collapsing) would
        // otherwise strand it at the pre-shift rect until the next scroll.
        requestAnimationFrame(updateAll);
        if (canSafelyResyncMobileDraftIdleCaret(editor.state)) {
          const anchor = getScriptureDraftAnchorPos(editor.state);
          const draftRange = getScriptureDraftRange(editor.state);
          if (anchor != null && draftRange) {
            resyncMobileCaret(editor.view, {
              pos: anchor,
              draftIdle: true,
              markFrom: draftRange.from,
              markTo: draftRange.to,
            });
          }
        }
      }, 260);
    };
    const onSelectionChange = () => {
      // During active typing the idle timer owns re-showing the ✓; don't flash it at the caret.
      if (Date.now() - lastTypeAt < 260) return;
      updateAll();
    };
    const onBlur = () => setBookSuggestion(null);

    // Tab takes the first book and Escape hides the row — only while the row is up. Capture on
    // the editor's own element so this runs before ProseMirror's keydown.
    const onKeyDown = (e: KeyboardEvent) => {
      const s = bookSuggestionRef.current;
      if (!s) return;
      if (e.key === 'Tab' && !e.shiftKey && !e.altKey && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        e.stopImmediatePropagation();
        acceptBook(s.books[0]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        dismissedBookKeyRef.current = `${s.from}:${s.typedBook}`;
        setBookSuggestion(null);
      }
    };

    updateAll();
    editor.on('update', onDocUpdate);
    editor.on('selectionUpdate', onSelectionChange);
    editor.on('blur', onBlur);
    const dom = editor.view.dom as HTMLElement;
    dom.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('scroll', updateAll, true);
    window.addEventListener('resize', updateAll);
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    vv?.addEventListener('resize', updateAll);
    vv?.addEventListener('scroll', updateAll);
    // The mobile shell frame is resized programmatically across the keyboard-settle window, which
    // moves every line of the editor without firing scroll/resize. That is what leaves the FIRST ✓
    // of a note misaligned — it is measured 260ms after the last keystroke, between two settle
    // passes, while later ones land after the frame has stopped moving.
    const offSettle = onProtoViewportSettle(updateAll);
    return () => {
      if (idleTimer) clearTimeout(idleTimer);
      if (!editor.isDestroyed) {
        editor.off('update', onDocUpdate);
        editor.off('selectionUpdate', onSelectionChange);
        editor.off('blur', onBlur);
      }
      dom.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('scroll', updateAll, true);
      window.removeEventListener('resize', updateAll);
      vv?.removeEventListener('resize', updateAll);
      vv?.removeEventListener('scroll', updateAll);
      offSettle();
    };
    // acceptBook reads only refs and the editor, so the closure captured here never goes stale.
  }, [editor]);

  if (!confirm && !bookSuggestion) return null;

  return createPortal(
    <>
      {bookSuggestion && (
        <div
          className={`scripture-book-suggest${bookSuggestion.below ? ' scripture-book-suggest--below' : ''}`}
          role="listbox"
          aria-label="Did you mean"
          style={{ position: 'fixed', top: bookSuggestion.top, left: bookSuggestion.left, zIndex: 99999 }}
        >
          {bookSuggestion.books.map((book, i) => (
            <button
              key={book}
              type="button"
              role="option"
              aria-selected={i === 0}
              className="scripture-book-suggest__option"
              // Keep the caret (and the iOS keyboard) in the editor.
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                acceptBook(book);
              }}
              onMouseDown={(e) => e.preventDefault()}
            >
              {book} {bookSuggestion.tail}
              {i === 0 && <kbd className="scripture-book-suggest__key">Tab</kbd>}
            </button>
          ))}
        </div>
      )}
      {confirm && (
        <button
          type="button"
          className={`scripture-draft-confirm-float${
            confirm.invalidReason ? ' scripture-draft-confirm-float--invalid' : ''
          }`}
          aria-label={
            confirm.invalidReason
              ? `Can't add this reference — ${confirm.invalidReason}`
              : 'Confirm scripture reference'
          }
          aria-disabled={confirm.invalidReason ? true : undefined}
          title={confirm.invalidReason ?? 'Confirm'}
          style={{
            position: 'fixed',
            top: confirm.top,
            left: confirm.left,
            zIndex: 99999,
            pointerEvents: 'auto',
          }}
          onPointerDown={(e) => {
            // preventDefault keeps the editor selection/focus alive and beats the blur handler.
            e.preventDefault();
            e.stopPropagation();
            if (!isTiptapViewReady(editor)) return;
            // Out-of-canon reference: the commit would refuse anyway, and the
            // confirmAnyScriptureDraftView fallback below would just retry the same doomed
            // draft. Leave the draft open so the user can fix it in place.
            if (confirm.invalidReason) return;
            const view = editor.view;
            if (confirmScriptureDraftView(view, confirm.to, { focus: true }) == null) {
              confirmAnyScriptureDraftView(view);
            }
          }}
        >
          <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" focusable="false">
            <path
              d="M13.5 4.5l-6.5 7-3.5-3.5"
              fill="none"
              stroke="#fff"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}
    </>,
    document.body,
  );
}

/**
 * The "did you mean" row for the reference ending at the caret, or null. Only when there is no
 * draft (a draft means the detector already read it) and the caret is collapsed in plain text.
 */
function computeBookSuggestion(editor: Editor, dismissedKey: string | null): BookSuggestionState | null {
  if (!isTiptapViewReady(editor) || !editor.isEditable || !editor.isFocused) return null;
  const { state, view } = editor;
  const { from, to, $from } = state.selection;
  if (from !== to || from < 2) return null;
  if (getScriptureDraftAnchorPos(state) != null) return null;
  if ($from.marks().some((m) => m.type.name === 'scripturePill' || m.type.name === 'scriptureDraft')) {
    return null;
  }
  // Mid-word ("joh 3:1|6") — wait until the caret is at the end of what they typed.
  const after = $from.nodeAfter?.isText ? ($from.nodeAfter.text ?? '') : '';
  if (/^[\w:\-–—]/.test(after)) return null;

  const sliceFrom = scriptureSliceStart(state.doc, from, 80);
  const text = state.doc.textBetween(sliceFrom, from);
  const match = suggestBooksForTypedReference(text);
  if (!match) return null;

  const bookFrom = mapSliceIndexToDocPos(state.doc, sliceFrom, from, match.bookStart);
  if (bookFrom == null) return null;
  const bookTo = bookFrom + match.typedBook.length;
  if (state.doc.textBetween(bookFrom, bookTo) !== match.typedBook) return null;
  if (dismissedKey === `${bookFrom}:${match.typedBook}`) return null;

  try {
    const coords = view.coordsAtPos(bookFrom);
    // Same visual→layout viewport correction as the ✓ (position: fixed under the iOS keyboard).
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    const ox = vv?.offsetLeft ?? 0;
    const oy = vv?.offsetTop ?? 0;
    const vw = typeof window !== 'undefined' ? window.innerWidth : 9999;
    const below = coords.top < 56;
    return {
      from: bookFrom,
      to: bookTo,
      typedBook: match.typedBook,
      tail: match.tail,
      books: match.books,
      top: (below ? coords.bottom + 6 : coords.top - 6) + oy,
      left: Math.max(8, Math.min(coords.left - 4, vw - 240)) + ox,
      below,
    };
  } catch {
    return null;
  }
}
