'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';
import { useNote } from '../../../spa/src/hooks/queries/useNote';
import { stripServerAutoUntitledNoteTitleForDisplay } from '@/utils/server-auto-untitled-note-display';
import {
  isStudyHighlightAccentKey,
  type StudyHighlightAccentKey,
  STUDY_HIGHLIGHT_SWATCHES_NO_NEUTRAL,
  STUDY_HIGHLIGHT_ACCENT_LABELS,
  studyDockAccentCssVar,
} from '@/utils/study-highlight-accents';
import '@/styles/link-preview-card.css';

const CARD_WIDTH = 260;
const CARD_OFFSET = 6;
const VIEWPORT_MARGIN = 8;

type AnchorRect = { top: number; left: number; bottom: number; right: number; width: number; height: number };

function computePos(anchor: AnchorRect, cardHeight: number) {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 800;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 600;
  let top = anchor.bottom + CARD_OFFSET;
  if (top + cardHeight + VIEWPORT_MARGIN > vh) top = anchor.top - cardHeight - CARD_OFFSET;
  if (top < VIEWPORT_MARGIN) top = VIEWPORT_MARGIN;
  let left = anchor.left + anchor.width / 2 - CARD_WIDTH / 2;
  if (left < VIEWPORT_MARGIN) left = VIEWPORT_MARGIN;
  if (left + CARD_WIDTH + VIEWPORT_MARGIN > vw) left = vw - CARD_WIDTH - VIEWPORT_MARGIN;
  return { top, left };
}

export interface ConnectedNoteHighlightPopupProps {
  linkedNoteId: string;
  studyThreadId: string;
  accent: StudyHighlightAccentKey;
  anchorRect: AnchorRect;
  onNavigate: () => void;
  onAccentChange: (accent: StudyHighlightAccentKey) => void;
  onDisconnect: () => void;
  onDismiss: () => void;
}

export default function ConnectedNoteHighlightPopup({
  linkedNoteId,
  accent,
  anchorRect,
  onNavigate,
  onAccentChange,
  onDisconnect,
  onDismiss,
}: ConnectedNoteHighlightPopupProps) {
  const { data: note } = useNote(linkedNoteId);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>(() => computePos(anchorRect, 120));

  const title = note
    ? stripServerAutoUntitledNoteTitleForDisplay((note.title ?? '').trim()) || 'Untitled note'
    : '…';

  useLayoutEffect(() => {
    const h = cardRef.current?.offsetHeight ?? 120;
    setPos(computePos(anchorRect, h));
  }, [anchorRect, title]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onDismiss(); };
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (t && cardRef.current?.contains(t)) return;
      onDismiss();
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown, { capture: true });
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown, { capture: true } as AddEventListenerOptions);
    };
  }, [onDismiss]);

  const currentAccent = isStudyHighlightAccentKey(accent) ? accent : 'violet';

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={cardRef}
      className="link-preview-card"
      data-harvous-bottom-sheet-floating=""
      style={{ position: 'fixed', top: pos.top, left: pos.left, width: CARD_WIDTH, zIndex: 99999 }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Note title */}
      <div className="link-preview-card__body">
        <div className="link-preview-card__title">{title}</div>
      </div>

      {/* Go to button */}
      <div className="link-preview-card__actions">
        <button
          type="button"
          className="link-preview-card__btn link-preview-card__btn--primary"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onNavigate}
        >
          <span>Go to note</span>
          <Icon name="arrow-up-right-from-square" size={11} aria-hidden />
        </button>
      </div>

      {/* Color swatches */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 2 }}>
        {STUDY_HIGHLIGHT_SWATCHES_NO_NEUTRAL.map((key) => (
          <button
            key={key}
            type="button"
            aria-label={STUDY_HIGHLIGHT_ACCENT_LABELS[key]}
            title={STUDY_HIGHLIGHT_ACCENT_LABELS[key]}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onAccentChange(key)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 22,
              height: 22,
              borderRadius: '50%',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            <span
              style={{
                display: 'block',
                width: 14,
                height: 14,
                borderRadius: '50%',
                background: studyDockAccentCssVar(key),
                outline: currentAccent === key ? `2.5px solid ${studyDockAccentCssVar(key)}` : 'none',
                outlineOffset: 2,
              }}
              aria-hidden
            />
          </button>
        ))}
      </div>

      {/* Disconnect (trash) */}
      <div className="link-preview-card__icon-actions">
        <button
          type="button"
          className="link-preview-card__icon-btn link-preview-card__icon-btn--danger"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onDisconnect}
          aria-label="Disconnect note"
          title="Disconnect note"
        >
          <Icon name="trash-can" size={13} aria-hidden />
        </button>
      </div>
    </div>,
    document.body,
  );
}
