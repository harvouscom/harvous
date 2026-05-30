import { useEffect, useRef, useState } from 'react';
import type { LinkPreviewKind, LinkPreviewPayload } from './LinkPreviewCard';

const ENTER_DELAY_MS = 180;
const LEAVE_DELAY_MS = 140;

export interface HoverPreviewState {
  kind: LinkPreviewKind;
  anchorRect: DOMRect;
  payload: LinkPreviewPayload;
  /** The DOM element that triggered the preview — used for ProseMirror position lookup. */
  anchorEl: HTMLElement;
}

interface UseEditorHoverPreviewArgs {
  /** Root element to scope hover detection to. Typically the wrapper div containing `.ProseMirror`. */
  containerRef: { current: HTMLElement | null };
  /** When true, skip hover detection entirely (e.g. while a modal/dock is open). */
  disabled?: boolean;
}

/**
 * Detects when the user hovers a link element (.scripture-pill, .note-link, [data-url-link])
 * inside the editor and returns the preview state to render. Self-contained — relies only on
 * DOM events, not ProseMirror state. Existing click behavior is untouched.
 */
export function useEditorHoverPreview({ containerRef, disabled }: UseEditorHoverPreviewArgs) {
  const [preview, setPreview] = useState<HoverPreviewState | null>(null);
  const enterTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeAnchorRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const clearTimers = () => {
      if (enterTimer.current) {
        clearTimeout(enterTimer.current);
        enterTimer.current = null;
      }
      if (leaveTimer.current) {
        clearTimeout(leaveTimer.current);
        leaveTimer.current = null;
      }
    };

    if (disabled) {
      clearTimers();
      activeAnchorRef.current = null;
      setPreview(null);
      return;
    }

    const root = containerRef.current;
    if (!root) return;

    const findLinkAnchor = (el: HTMLElement | null): { anchor: HTMLElement; kind: LinkPreviewKind } | null => {
      if (!el) return null;
      // Scripture pills have their own dock chrome — skip them here.
      if (el.closest('.scripture-pill')) return null;
      const urlLink = el.closest('[data-url-link]') as HTMLElement | null;
      if (urlLink) return { anchor: urlLink, kind: 'url' };
      const noteLink = el.closest('.note-link') as HTMLElement | null;
      if (noteLink) {
        if (noteLink.hasAttribute('data-scripture-reference')) return null;
        return { anchor: noteLink, kind: 'note' };
      }
      return null;
    };

    const buildPayload = (kind: LinkPreviewKind, anchor: HTMLElement): LinkPreviewPayload | null => {
      if (kind === 'scripture') {
        const reference = anchor.getAttribute('data-scripture-reference');
        if (!reference) return null;
        return {
          reference,
          translation: anchor.getAttribute('data-scripture-translation'),
          scriptureNoteId: anchor.getAttribute('data-note-id'),
        };
      }
      if (kind === 'note') {
        const noteId = anchor.getAttribute('data-note-id');
        if (!noteId) return null;
        return { noteId };
      }
      if (kind === 'url') {
        const href = anchor.getAttribute('data-url-link') || anchor.getAttribute('href');
        if (!href) return null;
        return {
          href,
          urlTitle: anchor.getAttribute('data-url-title'),
          favicon: anchor.getAttribute('data-url-favicon'),
        };
      }
      return null;
    };

    const scheduleShow = (kind: LinkPreviewKind, anchor: HTMLElement) => {
      if (leaveTimer.current) {
        clearTimeout(leaveTimer.current);
        leaveTimer.current = null;
      }
      if (activeAnchorRef.current === anchor) return;
      if (enterTimer.current) clearTimeout(enterTimer.current);
      enterTimer.current = setTimeout(() => {
        const payload = buildPayload(kind, anchor);
        if (!payload) return;
        activeAnchorRef.current = anchor;
        setPreview({ kind, anchorRect: anchor.getBoundingClientRect(), payload, anchorEl: anchor });
      }, ENTER_DELAY_MS);
    };

    const scheduleHide = () => {
      if (enterTimer.current) {
        clearTimeout(enterTimer.current);
        enterTimer.current = null;
      }
      if (leaveTimer.current) clearTimeout(leaveTimer.current);
      leaveTimer.current = setTimeout(() => {
        activeAnchorRef.current = null;
        setPreview(null);
      }, LEAVE_DELAY_MS);
    };

    const onMouseOver = (e: MouseEvent) => {
      const match = findLinkAnchor(e.target as HTMLElement);
      if (!match) {
        // Hovering non-link content within editor — if a card is open and the pointer
        // moves outside any link, schedule hide. (Card itself cancels via its own handlers.)
        if (activeAnchorRef.current) scheduleHide();
        return;
      }
      scheduleShow(match.kind, match.anchor);
    };

    const onMouseOut = (e: MouseEvent) => {
      // Only hide when leaving an active anchor toward a non-anchor target
      const from = e.target as HTMLElement | null;
      const to = e.relatedTarget as HTMLElement | null;
      if (!activeAnchorRef.current) return;
      if (from && activeAnchorRef.current.contains(from)) {
        if (to && activeAnchorRef.current.contains(to)) return;
        scheduleHide();
      }
    };

    root.addEventListener('mouseover', onMouseOver);
    root.addEventListener('mouseout', onMouseOut);
    return () => {
      root.removeEventListener('mouseover', onMouseOver);
      root.removeEventListener('mouseout', onMouseOut);
      clearTimers();
    };
  }, [containerRef, disabled]);

  const cancelHide = () => {
    if (leaveTimer.current) {
      clearTimeout(leaveTimer.current);
      leaveTimer.current = null;
    }
  };

  const dismiss = () => {
    if (enterTimer.current) {
      clearTimeout(enterTimer.current);
      enterTimer.current = null;
    }
    if (leaveTimer.current) {
      clearTimeout(leaveTimer.current);
      leaveTimer.current = null;
    }
    activeAnchorRef.current = null;
    setPreview(null);
  };

  return { preview, cancelHide, dismiss };
}
