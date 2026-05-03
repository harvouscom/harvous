'use client';

import React from 'react';
import { ArrowCounterClockwise, CardsThree, PushPin } from '@phosphor-icons/react';

export interface NoteProductionActionBarProps {
  collectionDraft: string;
  onDraftChange: (next: string) => void;
  collectionPinned: boolean;
  collectionUserOverride: boolean;
  onTogglePinned: () => void;
  onRestoreAuto: () => void;
  disabled?: boolean;
}

/** Bottom note-actions row for production SPA: collection folder only (chip + pin + restore auto).
 * Tag add/remove stays in Note Details — keeps iOS new-note sheet aligned with desktop (collection only).
 * Portaled by CardFullEditable into the column host; visibility is gated by parent `display`.
 */
export default function NoteProductionActionBar({
  collectionDraft,
  onDraftChange,
  collectionPinned,
  collectionUserOverride,
  onTogglePinned,
  onRestoreAuto,
  disabled,
}: NoteProductionActionBarProps) {
  return (
    <div className="note-production-action-bar" role="toolbar" aria-label="Note actions">
      <div className="note-production-action-bar__inner">
        <CardsThree size={15} aria-hidden style={{ opacity: 0.45, flexShrink: 0 }} />
        <div className="note-production-action-bar__chip-wrap">
          {!collectionUserOverride ? (
            <span className="note-production-action-bar__badge">Auto</span>
          ) : (
            <span className="note-production-action-bar__badge">You</span>
          )}
          <input
            type="text"
            disabled={disabled}
            className="note-production-action-bar__collection-input"
            aria-label="Collection"
            placeholder="No collection"
            value={collectionDraft}
            onChange={(e) => onDraftChange(e.target.value)}
          />
        </div>
        <div className="note-production-action-bar__chip-actions">
          <button
            type="button"
            disabled={disabled}
            className={`note-production-action-bar__icon-btn${collectionPinned ? ' note-production-action-bar__icon-btn--on' : ''}`}
            title={collectionPinned ? 'Unpin collection' : 'Pin collection'}
            aria-pressed={collectionPinned}
            onMouseDown={(e) => e.preventDefault()}
            onClick={onTogglePinned}
          >
            <PushPin size={16} weight={collectionPinned ? 'fill' : 'regular'} />
          </button>
          <button
            type="button"
            disabled={disabled}
            className="note-production-action-bar__icon-btn"
            title="Restore suggested collection"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onRestoreAuto}
          >
            <ArrowCounterClockwise size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
