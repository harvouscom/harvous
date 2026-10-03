'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getMarkRange, type Editor } from '@tiptap/core';
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
import { getCachedVersePeek, getVersePeek, verseHtmlToPeekText } from '@/utils/verse-peek';
import { fetchVerseHtml, getCachedVerseHtml } from '@/utils/fetch-verse-html';
import {
  SCRIPTURE_DRAFT_CONFIRMED_EVENT,
  type ScriptureDraftConfirmedDetail,
} from '@/utils/scripture-draft-events';
import { getEffectiveDefaultTranslation } from '@/utils/profile-cache';
import { getTranslationAbbreviationDisplay } from '@/data/translations';
import { getCachedPassageHistory, getPassageHistory, passageHistoryLabel } from '@/utils/passage-history';
import { isGuestLocalNote } from '../../../spa/src/lib/guest-store';

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

interface VersePeekState {
  /** Verse text; empty when only the history line could be had. */
  text: string;
  /** "in 3 of your notes" — other notes of yours on this passage, or null. */
  history: string | null;
  /** Short label for the translation the text is in, e.g. "NET". */
  translationLabel: string;
  top: number;
  left: number;
  maxWidth: number;
  below: boolean;
}

/** The "Quote" offer beside a pill that was just typed. */
interface QuoteOfferState {
  reference: string;
  /** The caret when the offer was made; it moving anywhere else is what withdraws the offer. */
  caret: number;
  top: number;
  left: number;
  loading: boolean;
}

/** How long a quote offer waits for a tap before it steps away on its own. */
const QUOTE_OFFER_MS = 8000;

export interface ScriptureDraftChromeWebProps {
  editor: Editor;
  /** The note being edited — left out of the passage-history count. */
  sourceNoteId?: string | null;
  /**
   * Put the words of a pill that was just typed into the note, as a quote under it. Omitted,
   * the offer never shows. The editor owns the insert — it is the same one the passage dock's
   * quote uses, with its attribution and save plumbing — so this only supplies the words.
   */
  onQuote?: (payload: { excerpt: string; reference: string; translation: string }) => void;
}

/**
 * Everything that floats beside an inline scripture draft (prototype): the ✓ confirm, and —
 * before a draft exists — a "Did you mean John 3:16?" row for a reference the detector can't
 * read (`joh 3:16`). Accepting rewrites only the book; the normal detection then drafts it.
 * Once the draft is a reference that would commit, a one-line peek of the verse sits above it,
 * so confirming feels like grabbing the verse rather than typing a citation and hoping.
 *
 * Rendered OUTSIDE the editor, as portals — an inline contentEditable=false widget at the draft
 * blocks iOS text entry next to it. Every control here takes `pointerdown` with preventDefault so
 * the caret never leaves the draft.
 */
export default function ScriptureDraftChromeWeb({
  editor,
  sourceNoteId = null,
  onQuote,
}: ScriptureDraftChromeWebProps) {
  const [confirm, setConfirm] = useState<DraftConfirmState | null>(null);
  const [quoteOffer, setQuoteOffer] = useState<QuoteOfferState | null>(null);
  const quoteOfferRef = useRef<QuoteOfferState | null>(null);
  quoteOfferRef.current = quoteOffer;
  const onQuoteRef = useRef(onQuote);
  onQuoteRef.current = onQuote;
  const [bookSuggestion, setBookSuggestion] = useState<BookSuggestionState | null>(null);
  const [peek, setPeek] = useState<VersePeekState | null>(null);
  const sourceNoteIdRef = useRef(sourceNoteId);
  sourceNoteIdRef.current = sourceNoteId;
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

    // Bumped on every edit, so a peek that resolves after the draft changed is dropped.
    let peekToken = 0;
    const updatePeek = () => {
      const target = computePeekTarget(editor);
      if (!target) {
        peekToken++;
        setPeek(null);
        return;
      }
      const noteId = sourceNoteIdRef.current;
      // Guests have no server notes to count, and the request would only 401.
      const wantsHistory = !isGuestLocalNote(noteId);
      const show = (text: string | null, history: string | null) =>
        setPeek(text || history ? placePeek(editor, text ?? '', history, target.translation) : null);

      const cachedText = getCachedVersePeek(target.reference, target.translation);
      const cachedHistory = wantsHistory ? getCachedPassageHistory(target.reference, noteId) : null;
      if (cachedText && (!wantsHistory || cachedHistory)) {
        show(cachedText, passageHistoryLabel(cachedHistory));
        return;
      }
      const token = ++peekToken;
      void Promise.all([
        cachedText ?? getVersePeek(target.reference, target.translation),
        wantsHistory ? (cachedHistory ?? getPassageHistory(target.reference, noteId)) : null,
      ]).then(([text, history]) => {
        if (token !== peekToken) return;
        show(text, passageHistoryLabel(history));
      });
    };

    const updateAll = () => {
      updatePos();
      updateBookSuggestion();
      updatePeek();
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
      peekToken++;
      setPeek(null);
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

  /*
   * Offer the words, right after a reference is typed.
   *
   * A typed pill named the passage and stopped there: to see what it said you tapped it, and
   * to keep the words in the note you opened the dock and quoted from it. The verse peek
   * already showed the words while the draft was open — this is the moment after, when the
   * pill exists and the question is whether you want them on the page. Only for a pill typed
   * from scratch (`isNew`); re-confirming an edited pill is not asking for anything.
   *
   * An offer, not a step: it goes the moment the caret moves (you kept writing, which is an
   * answer) or after a few seconds, and nothing is inserted unless it is tapped.
   */
  useEffect(() => {
    if (!onQuoteRef.current) return;
    const dom = editor.view.dom as HTMLElement;
    let hideTimer: ReturnType<typeof setTimeout> | null = null;
    const clear = () => {
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = null;
      quoteOfferRef.current = null;
      setQuoteOffer(null);
    };
    const onConfirmed = (e: Event) => {
      const detail = (e as CustomEvent<ScriptureDraftConfirmedDetail>).detail;
      if (!detail?.isNew || !onQuoteRef.current) return;
      // After the confirm's own transaction has painted, so the pill has a box to sit beside.
      requestAnimationFrame(() => {
        const placed = placeQuoteOffer(editor);
        if (!placed) return;
        setQuoteOffer({ reference: detail.reference, loading: false, ...placed });
        if (hideTimer) clearTimeout(hideTimer);
        hideTimer = setTimeout(clear, QUOTE_OFFER_MS);
      });
    };
    /*
     * Withdrawn by what YOU do next, not by what the editor does. A confirm is followed by the
     * editor's own transactions — the trailing space, the pending-translation pass, the draft
     * id swap on first save — and treating those as "the caret moved" took the offer away
     * before it could be seen. So the caret is carried through every transaction, and only a
     * key or a click in the editor counts as an answer.
     */
    const onTransaction = ({
      transaction,
    }: {
      transaction: { docChanged: boolean; mapping: { map: (p: number) => number } };
    }) => {
      if (!quoteOfferRef.current || !transaction.docChanged) return;
      // Functional: the quote's own insert is a transaction, and a copy of the offer taken
      // from the ref here would bring it back after `takeQuoteOffer` had cleared it.
      setQuoteOffer((offer) => {
        if (!offer) return offer;
        const caret = transaction.mapping.map(offer.caret);
        return caret === offer.caret ? offer : { ...offer, caret };
      });
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (!quoteOfferRef.current || quoteOfferRef.current.loading) return;
      // Modifier presses on their own are not an answer — they are the start of a shortcut.
      if (e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta') return;
      // Nor is a space: the double-space that confirms a draft can land its second space after
      // the confirm, and that space was part of making the pill, not a reply to the offer.
      if (e.key === ' ') return;
      clear();
    };
    const onPointerDown = () => {
      if (quoteOfferRef.current && !quoteOfferRef.current.loading) clear();
    };
    dom.addEventListener(SCRIPTURE_DRAFT_CONFIRMED_EVENT, onConfirmed);
    dom.addEventListener('keydown', onKeyDown, true);
    dom.addEventListener('pointerdown', onPointerDown, true);
    editor.on('transaction', onTransaction);
    editor.on('blur', clear);
    return () => {
      if (hideTimer) clearTimeout(hideTimer);
      dom.removeEventListener(SCRIPTURE_DRAFT_CONFIRMED_EVENT, onConfirmed);
      dom.removeEventListener('keydown', onKeyDown, true);
      dom.removeEventListener('pointerdown', onPointerDown, true);
      if (!editor.isDestroyed) {
        editor.off('transaction', onTransaction);
        editor.off('blur', clear);
      }
    };
  }, [editor]);

  const takeQuoteOffer = async () => {
    const offer = quoteOfferRef.current;
    const quote = onQuoteRef.current;
    if (!offer || offer.loading || !quote || !isTiptapViewReady(editor)) return;
    // The translation is read now, not when the offer was made: typing "ESV" after a pill
    // re-labels it a moment after the confirm, and the quote should be in the version the
    // pill ended up in.
    const pill = pillBeforePos(editor, offer.caret);
    const translation: string = pill?.translation || getEffectiveDefaultTranslation();
    const loading = { ...offer, loading: true };
    quoteOfferRef.current = loading;
    setQuoteOffer(loading);
    const html =
      getCachedVerseHtml(offer.reference, translation) ??
      (await fetchVerseHtml(offer.reference, translation));
    quoteOfferRef.current = null;
    setQuoteOffer(null);
    // "This verse is not included in the … translation." arrives as italic HTML, not a 404 —
    // and quoting that sentence into someone's note as Scripture would be worse than nothing.
    if (!html || /^\s*<p><em>/.test(html)) return;
    const excerpt = verseHtmlToPeekText(html);
    if (!excerpt) return;
    quote({ excerpt, reference: offer.reference, translation });
  };

  if (!confirm && !bookSuggestion && !peek && !quoteOffer) return null;

  return createPortal(
    <>
      {peek && (
        <div
          className={`scripture-verse-peek${peek.below ? ' scripture-verse-peek--below' : ''}`}
          aria-live="polite"
          style={{
            position: 'fixed',
            top: peek.top,
            left: peek.left,
            maxWidth: peek.maxWidth,
            zIndex: 99998,
          }}
        >
          {peek.text && <span className="scripture-verse-peek__text">{peek.text}</span>}
          {peek.text && <span className="scripture-verse-peek__trans">{peek.translationLabel}</span>}
          {peek.history && <span className="scripture-verse-peek__history">{peek.history}</span>}
        </div>
      )}
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
      {quoteOffer && (
        <button
          type="button"
          className="scripture-quote-offer"
          aria-label={`Quote ${quoteOffer.reference} into this note`}
          title="Add the verse text as a quote"
          aria-busy={quoteOffer.loading || undefined}
          style={{ position: 'fixed', top: quoteOffer.top, left: quoteOffer.left, zIndex: 99999 }}
          // Same as the ✓: keep the caret, and the iOS keyboard, in the editor.
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void takeQuoteOffer();
          }}
          onMouseDown={(e) => e.preventDefault()}
          // Keyboard activation only (`detail` 0) — a pointer already answered on pointerdown.
          onClick={(e) => {
            if (e.detail === 0) void takeQuoteOffer();
          }}
        >
          {quoteOffer.loading ? 'Quoting…' : 'Quote'}
        </button>
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

/** The draft's reference and translation when it would commit right now, else null. */
function computePeekTarget(editor: Editor): { reference: string; translation: string } | null {
  if (!isTiptapViewReady(editor) || !editor.isFocused) return null;
  const { state } = editor;
  const to = getScriptureDraftAnchorPos(state);
  if (to == null) return null;
  const validity = getScriptureDraftValidity(state, to);
  if (validity.status !== 'ready') return null;
  const range = getScriptureDraftRange(state);
  const draftMark = range
    ? state.doc.nodeAt(range.from)?.marks.find((m) => m.type.name === 'scriptureDraft')
    : null;
  const translation: string = draftMark?.attrs.translation || getEffectiveDefaultTranslation();
  return { reference: validity.reference, translation };
}

/** Measure where the peek goes: above the draft's first line, aligned to its start. */
function placePeek(
  editor: Editor,
  text: string,
  history: string | null,
  translation: string,
): VersePeekState | null {
  if (!isTiptapViewReady(editor)) return null;
  const to = getScriptureDraftAnchorPos(editor.state);
  if (to == null) return null;
  const draftEl = getScriptureDraftAnchorElement(editor.view, to);
  if (!draftEl) return null;
  const rects = draftEl.getClientRects();
  if (rects.length === 0) return null;
  const first = rects[0];
  const last = rects[rects.length - 1];
  const vv = typeof window !== 'undefined' ? window.visualViewport : null;
  const ox = vv?.offsetLeft ?? 0;
  const oy = vv?.offsetTop ?? 0;
  const vw = typeof window !== 'undefined' ? window.innerWidth : 9999;
  const below = first.top < 56;
  const left = Math.max(8, Math.min(first.left - 4, vw - 200));
  return {
    text,
    history,
    translationLabel: getTranslationAbbreviationDisplay(translation),
    top: (below ? last.bottom + 6 : first.top - 6) + oy,
    left: left + ox,
    maxWidth: Math.min(420, vw - left - 8),
    below,
  };
}

/** The scripture pill ending at or just before `pos` — the confirm leaves a space after it,
    and a double-space confirm can leave two. */
function pillBeforePos(
  editor: Editor,
  pos: number,
): { from: number; to: number; translation: string | null } | null {
  const { state } = editor;
  const markType = state.schema.marks.scripturePill;
  if (!markType) return null;
  for (let at = pos; at >= Math.max(1, pos - 3); at--) {
    const $at = state.doc.resolve(at);
    const mark = $at.nodeBefore?.marks.find((m) => m.type === markType);
    if (!mark) continue;
    const range = getMarkRange(state.doc.resolve(at - 1), markType);
    if (!range) return null;
    return { ...range, translation: (mark.attrs.translation as string | null) ?? null };
  }
  return null;
}

/** Where the quote offer goes: just past the pill that was typed, centred on its line. */
function placeQuoteOffer(editor: Editor): { caret: number; top: number; left: number } | null {
  if (!isTiptapViewReady(editor)) return null;
  const caret = editor.state.selection.from;
  const pill = pillBeforePos(editor, caret);
  if (!pill) return null;
  try {
    const end = editor.view.coordsAtPos(pill.to);
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    const ox = vv?.offsetLeft ?? 0;
    const oy = vv?.offsetTop ?? 0;
    const vw = typeof window !== 'undefined' ? window.innerWidth : 9999;
    return {
      caret,
      top: (end.top + end.bottom) / 2 + oy,
      // Past the space the confirm leaves, so the chip does not sit on the caret.
      left: Math.min(end.right + 14, vw - 90) + ox,
    };
  } catch {
    return null;
  }
}
