'use client';

import { useEffect, useState } from 'react';
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

interface DraftConfirmState {
  top: number;
  left: number;
  to: number;
  /** Set when the reference parses but doesn't resolve against the canon — the ✓ won't commit. */
  invalidReason: string | null;
}

export interface ScriptureDraftChromeWebProps {
  editor: Editor;
}

/**
 * Everything that floats beside an inline scripture draft (prototype): the ✓ confirm.
 *
 * Rendered OUTSIDE the editor, as portals — an inline contentEditable=false widget at the draft
 * blocks iOS text entry next to it. Every control here takes `pointerdown` with preventDefault so
 * the caret never leaves the draft.
 */
export default function ScriptureDraftChromeWeb({ editor }: ScriptureDraftChromeWebProps) {
  const [confirm, setConfirm] = useState<DraftConfirmState | null>(null);

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

    // Hide the ✓ while actively typing — it sits at the draft's right edge, exactly where the next
    // character lands, so leaving it up covers the char being typed. Re-show + reposition once the
    // user pauses (same idle cadence as the mobile draft grow), so it reappears at the grown pill.
    let lastTypeAt = 0;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    const onDocUpdate = () => {
      lastTypeAt = Date.now();
      setConfirm(null);
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        idleTimer = null;
        updatePos();
        // Measure again on the next frame: showing the ✓ is the moment the draft's inline box has
        // just settled, and a sub-frame layout shift (fonts, the chrome row collapsing) would
        // otherwise strand it at the pre-shift rect until the next scroll.
        requestAnimationFrame(updatePos);
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
      updatePos();
    };

    updatePos();
    editor.on('update', onDocUpdate);
    editor.on('selectionUpdate', onSelectionChange);
    window.addEventListener('scroll', updatePos, true);
    window.addEventListener('resize', updatePos);
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    vv?.addEventListener('resize', updatePos);
    vv?.addEventListener('scroll', updatePos);
    // The mobile shell frame is resized programmatically across the keyboard-settle window, which
    // moves every line of the editor without firing scroll/resize. That is what leaves the FIRST ✓
    // of a note misaligned — it is measured 260ms after the last keystroke, between two settle
    // passes, while later ones land after the frame has stopped moving.
    const offSettle = onProtoViewportSettle(updatePos);
    return () => {
      if (idleTimer) clearTimeout(idleTimer);
      if (!editor.isDestroyed) {
        editor.off('update', onDocUpdate);
        editor.off('selectionUpdate', onSelectionChange);
      }
      window.removeEventListener('scroll', updatePos, true);
      window.removeEventListener('resize', updatePos);
      vv?.removeEventListener('resize', updatePos);
      vv?.removeEventListener('scroll', updatePos);
      offSettle();
    };
  }, [editor]);

  if (!confirm) return null;

  return createPortal(
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
    </button>,
    document.body,
  );
}
