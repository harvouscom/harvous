import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from '@/components/react/Icon';
import { useShareNote } from '../../hooks/mutations/useShareNote';
import ProtoPopoverShell from './ProtoPopoverShell';

/**
 * Floating share popover anchored under the prototype's share pill. Mirrors
 * the `createPortal` + `anchorRect` pattern used by `LinkPreviewCard.tsx`
 * (also used by the translation picker and selection action bar inside
 * `TiptapEditor.tsx`).
 *
 * Renders three states:
 *  - Private (default): one big primary button to enable sharing.
 *  - Public: read-only URL field + Copy button + "Get a new link" + Disable.
 *  - Pending / error states inline.
 *
 * The popover is dismissed on outside-click and `Escape`. The host (the
 * share pill button) owns the `open` state.
 */

const CARD_WIDTH = 320;
const VIEWPORT_MARGIN = 12;
const CARD_OFFSET = 8;

interface PrototypeSharePopoverProps {
  noteId: string;
  isPublic: boolean;
  shareToken: string | null;
  anchorRect: DOMRect | null;
  onDismiss: () => void;
}

function computePosition(
  anchor: DOMRect,
  cardHeight: number,
): { top: number; left: number } {
  if (typeof window === 'undefined') return { top: 0, left: 0 };
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Prefer popping *below* the toolbar button. Fall back above if near bottom.
  let top = anchor.bottom + CARD_OFFSET;
  if (top + cardHeight + VIEWPORT_MARGIN > vh) {
    top = anchor.top - cardHeight - CARD_OFFSET;
  }
  if (top < VIEWPORT_MARGIN) {
    top = VIEWPORT_MARGIN;
  }

  // Right-align the card to the button, keeping it within the viewport.
  let left = anchor.right - CARD_WIDTH;
  if (left < VIEWPORT_MARGIN) left = VIEWPORT_MARGIN;
  if (left + CARD_WIDTH + VIEWPORT_MARGIN > vw) {
    left = vw - CARD_WIDTH - VIEWPORT_MARGIN;
  }
  return { top, left };
}

export default function PrototypeSharePopover({
  noteId,
  isPublic,
  shareToken,
  anchorRect,
  onDismiss,
}: PrototypeSharePopoverProps) {
  const shareMutation = useShareNote();
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [copied, setCopied] = useState(false);

  // Build the canonical public URL. The server returns one too, but we
  // construct it client-side so the popover paints instantly on enable
  // without waiting for the response to land.
  const shareUrl = useMemo(() => {
    if (!isPublic || !shareToken) return null;
    if (typeof window === 'undefined') return null;
    return `${window.location.origin}/shared/note/${shareToken}`;
  }, [isPublic, shareToken]);

  // Position once the card has measured itself.
  useLayoutEffect(() => {
    if (!anchorRect) return;
    const h = cardRef.current?.getBoundingClientRect().height ?? 180;
    setPos(computePosition(anchorRect, h));
  }, [anchorRect, isPublic]);

  // Dismiss on outside-click and Escape.
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (!cardRef.current) return;
      const target = e.target as Node | null;
      if (target && !cardRef.current.contains(target)) {
        onDismiss();
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onDismiss();
    }
    window.addEventListener('pointerdown', onPointerDown, { capture: true });
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, { capture: true } as any);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onDismiss]);

  if (!anchorRect || typeof document === 'undefined') return null;

  const isBusy = shareMutation.isPending;
  const errorMessage = shareMutation.error instanceof Error ? shareMutation.error.message : null;

  async function handleEnable() {
    try { await shareMutation.mutateAsync({ noteId, action: 'enable' }); } catch { /* surfaced via shareMutation.error */ }
  }
  async function handleDisable() {
    try { await shareMutation.mutateAsync({ noteId, action: 'disable' }); } catch { /* ignore */ }
  }
  async function handleRefresh() {
    try { await shareMutation.mutateAsync({ noteId, action: 'refresh' }); } catch { /* ignore */ }
  }

  async function handleCopy() {
    if (!shareUrl) return;
    let success = false;
    // Primary: async clipboard API (requires secure context / permission)
    try {
      await navigator.clipboard.writeText(shareUrl);
      success = true;
    } catch {
      // Fallback: legacy execCommand (works on http:// / older browsers)
      try {
        const el = document.createElement('textarea');
        el.value = shareUrl;
        el.style.cssText = 'position:fixed;opacity:0;pointer-events:none;';
        document.body.appendChild(el);
        el.focus();
        el.select();
        success = document.execCommand('copy');
        document.body.removeChild(el);
      } catch {
        // Both methods failed — no-op
      }
    }
    if (success) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    }
  }

  return createPortal(
    <ProtoPopoverShell
      ref={cardRef}
      role="dialog"
      aria-label="Share note"
      className="proto-share-popover"
      style={{
        position: 'fixed',
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        width: CARD_WIDTH,
        zIndex: 6000,
      }}
    >
      <div className="proto-share-popover__header">
        <div className="proto-share-popover__title">Share note</div>
        <div className="proto-share-popover__subtitle">
          {isPublic
            ? 'Anyone with the link can view this note.'
            : 'Only you can see this note. Enable sharing to get a link.'}
        </div>
      </div>

      {!isPublic ? (
        <button
          type="button"
          className="proto-share-popover__primary"
          onClick={handleEnable}
          disabled={isBusy}
        >
          {isBusy ? 'Creating link…' : 'Create share link'}
        </button>
      ) : (
        <>
          <div className="proto-share-popover__url-row">
            <input
              type="text"
              readOnly
              value={shareUrl ?? ''}
              className="proto-share-popover__url-input"
              onFocus={(e) => e.currentTarget.select()}
              aria-label="Share URL"
            />
            <button
              type="button"
              className="proto-share-popover__copy"
              onClick={handleCopy}
              disabled={!shareUrl}
              aria-label="Copy share URL"
            >
              {copied ? (
                <>
                  <Icon name="check" size={14} aria-hidden />
                  Copied
                </>
              ) : (
                <>
                  <Icon name="copy" size={14} aria-hidden />
                  Copy
                </>
              )}
            </button>
          </div>

          <div className="proto-share-popover__actions">
            <button
              type="button"
              className="proto-share-popover__link-action"
              onClick={handleRefresh}
              disabled={isBusy}
            >
              {isBusy ? 'Working…' : 'Get a new link'}
            </button>
            <button
              type="button"
              className="proto-share-popover__link-action proto-share-popover__link-action--danger"
              onClick={handleDisable}
              disabled={isBusy}
            >
              Stop sharing
            </button>
          </div>
        </>
      )}

      {errorMessage ? (
        <div className="proto-share-popover__error" role="alert">{errorMessage}</div>
      ) : null}
    </ProtoPopoverShell>,
    document.body,
  );
}
