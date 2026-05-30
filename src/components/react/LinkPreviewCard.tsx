import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from '@/components/react/Icon';
import { useNote } from '../../../spa/src/hooks/queries/useNote';
import { stripServerAutoUntitledNoteTitleForDisplay } from '@/utils/server-auto-untitled-note-display';
import '@/styles/link-preview-card.css';

const CARD_WIDTH = 280;
const CARD_OFFSET = 8;
const VIEWPORT_MARGIN = 8;

export type LinkPreviewKind = 'note' | 'scripture' | 'url';

export interface LinkPreviewPayload {
  /** Note kind */
  noteId?: string;
  /** Scripture kind */
  reference?: string;
  translation?: string | null;
  scriptureNoteId?: string | null;
  /** URL kind */
  href?: string;
  urlTitle?: string | null;
  favicon?: string | null;
}

export interface LinkPreviewCardProps {
  kind: LinkPreviewKind;
  anchorRect: DOMRect | { top: number; left: number; bottom: number; right: number; width: number; height: number };
  payload: LinkPreviewPayload;
  onOpen?: () => void;
  onRemove?: () => void;
  onEdit?: () => void;
  onDismiss?: () => void;
  /** Called when pointer enters the card — caller should cancel any pending hide timer. */
  onPointerEnter?: () => void;
  /** Called when pointer leaves the card — caller should schedule hide. */
  onPointerLeave?: () => void;
}

function computePosition(anchor: LinkPreviewCardProps['anchorRect'], cardHeight: number) {
  if (typeof window === 'undefined') return { top: 0, left: 0 };
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let top = anchor.bottom + CARD_OFFSET;
  if (top + cardHeight + VIEWPORT_MARGIN > vh) {
    top = anchor.top - cardHeight - CARD_OFFSET;
  }
  if (top < VIEWPORT_MARGIN) top = VIEWPORT_MARGIN;

  let left = anchor.left + anchor.width / 2 - CARD_WIDTH / 2;
  if (left < VIEWPORT_MARGIN) left = VIEWPORT_MARGIN;
  if (left + CARD_WIDTH + VIEWPORT_MARGIN > vw) {
    left = vw - CARD_WIDTH - VIEWPORT_MARGIN;
  }
  return { top, left };
}

function NotePreviewBody({ noteId }: { noteId: string }) {
  const { data: note, isLoading } = useNote(noteId);

  const title = useMemo(() => {
    if (!note) return null;
    const raw = stripServerAutoUntitledNoteTitleForDisplay((note.title ?? '').trim());
    return raw || 'Untitled note';
  }, [note]);

  const excerpt = useMemo(() => {
    if (!note?.content) return null;
    const stripped = note.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (!stripped) return null;
    return stripped.length > 140 ? `${stripped.slice(0, 137).trimEnd()}…` : stripped;
  }, [note?.content]);

  if (isLoading && !note) {
    return <div className="link-preview-card__body link-preview-card__body--loading">Loading…</div>;
  }
  if (!note) {
    return <div className="link-preview-card__body link-preview-card__body--empty">Note not available</div>;
  }
  return (
    <div className="link-preview-card__body">
      <div className="link-preview-card__title" title={title ?? undefined}>{title}</div>
      {excerpt ? <div className="link-preview-card__excerpt">{excerpt}</div> : null}
    </div>
  );
}

function ScripturePreviewBody({ reference, translation }: { reference: string; translation?: string | null }) {
  return (
    <div className="link-preview-card__body">
      <div className="link-preview-card__title">{reference}</div>
      {translation ? (
        <div className="link-preview-card__meta">
          <span className="link-preview-card__badge">{translation}</span>
        </div>
      ) : null}
    </div>
  );
}

interface UrlMetadata {
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
}

const urlMetadataCache = new Map<string, UrlMetadata>();
const urlMetadataInflight = new Map<string, Promise<UrlMetadata | null>>();

function fetchUrlMetadata(url: string): Promise<UrlMetadata | null> {
  const cached = urlMetadataCache.get(url);
  if (cached) return Promise.resolve(cached);
  const inflight = urlMetadataInflight.get(url);
  if (inflight) return inflight;
  const p = fetch('/api/resource/metadata', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ url }),
  })
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      const m = data?.metadata;
      if (!m) return null;
      const md: UrlMetadata = {
        title: m.title || null,
        description: m.description || null,
        image: m.image || null,
        siteName: m.siteName || null,
      };
      urlMetadataCache.set(url, md);
      return md;
    })
    .catch(() => null)
    .finally(() => {
      urlMetadataInflight.delete(url);
    });
  urlMetadataInflight.set(url, p);
  return p;
}

function UrlPreviewBody({ href, urlTitle }: { href: string; urlTitle?: string | null }) {
  const [meta, setMeta] = useState<UrlMetadata | null>(() => urlMetadataCache.get(href) ?? null);
  const [loading, setLoading] = useState(!meta);

  useEffect(() => {
    let cancelled = false;
    if (!urlMetadataCache.has(href)) setLoading(true);
    fetchUrlMetadata(href).then((m) => {
      if (cancelled) return;
      setMeta(m);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [href]);

  const displayUrl = href.replace(/^https?:\/\//i, '').replace(/\/$/, '');
  const displayTitle = urlTitle || meta?.title || null;
  const displayDescription = meta?.description || null;
  return (
    <div className="link-preview-card__body">
      <span className="link-preview-card__host">{displayUrl}</span>
      {displayTitle ? <div className="link-preview-card__title">{displayTitle}</div> : null}
      {displayDescription ? <div className="link-preview-card__excerpt">{displayDescription}</div> : null}
      {!displayTitle && loading ? <div className="link-preview-card__body--loading">Loading preview…</div> : null}
    </div>
  );
}

/**
 * Floating preview card for editor links (note links, scripture pills, URL links)
 * and connected-note pills in the prototype action bar. Portaled to document.body.
 */
export default function LinkPreviewCard({
  kind,
  anchorRect,
  payload,
  onOpen,
  onRemove,
  onEdit,
  onDismiss,
  onPointerEnter,
  onPointerLeave,
}: LinkPreviewCardProps) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>(() => computePosition(anchorRect, 80));

  useLayoutEffect(() => {
    if (!cardRef.current) return;
    const h = cardRef.current.offsetHeight;
    setPos(computePosition(anchorRect, h));
  }, [anchorRect, kind, payload.noteId, payload.reference, payload.href]);

  useEffect(() => {
    if (!onDismiss) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDismiss]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={cardRef}
      className="link-preview-card"
      data-kind={kind}
      data-harvous-bottom-sheet-floating=""
      style={{
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        width: CARD_WIDTH,
        zIndex: 99999,
        pointerEvents: 'auto',
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onMouseEnter={onPointerEnter}
      onMouseLeave={onPointerLeave}
    >
      {kind === 'note' && payload.noteId ? <NotePreviewBody noteId={payload.noteId} /> : null}
      {kind === 'scripture' && payload.reference ? (
        <ScripturePreviewBody reference={payload.reference} translation={payload.translation ?? null} />
      ) : null}
      {kind === 'url' && payload.href ? (
        <UrlPreviewBody href={payload.href} urlTitle={payload.urlTitle} />
      ) : null}

      <div className="link-preview-card__actions">
        {onOpen ? (
          <button type="button" className="link-preview-card__btn link-preview-card__btn--primary" onClick={onOpen}>
            <span>Go to</span>
            <Icon name="arrow-up-right-from-square" size={11} aria-hidden />
          </button>
        ) : null}
      </div>
      {(onEdit || onRemove) ? (
        <div className="link-preview-card__icon-actions">
          {onEdit ? (
            <button type="button" className="link-preview-card__icon-btn" onClick={onEdit} aria-label="Edit link">
              <Icon name="pen" size={13} aria-hidden />
            </button>
          ) : null}
          {onRemove ? (
            <button type="button" className="link-preview-card__icon-btn link-preview-card__icon-btn--danger" onClick={onRemove} aria-label="Remove link">
              <Icon name="trash-can" size={13} aria-hidden />
            </button>
          ) : null}
        </div>
      ) : null}
    </div>,
    document.body,
  );
}
