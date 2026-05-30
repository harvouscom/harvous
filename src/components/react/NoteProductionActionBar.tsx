'use client';

import React, { useEffect, useRef, useState } from 'react';
import { IconCards, IconPin, IconPinFilled, IconRotate } from '@tabler/icons-react';

export interface NoteProductionActionBarProps {
  collectionDraft: string;
  onDraftChange: (next: string) => void;
  secondaryCollections: string[];
  onRemoveSecondary: (name: string) => void;
  addSecondaryDraft: string;
  onAddSecondaryDraftChange: (v: string) => void;
  onCommitAddSecondary: () => void;
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
  secondaryCollections,
  onRemoveSecondary,
  addSecondaryDraft,
  onAddSecondaryDraftChange,
  onCommitAddSecondary,
  collectionPinned,
  collectionUserOverride,
  onTogglePinned,
  onRestoreAuto,
  disabled,
}: NoteProductionActionBarProps) {
  const extra = secondaryCollections.length;
  const barRef = useRef<HTMLDivElement>(null);
  const [addSecondaryOpen, setAddSecondaryOpen] = useState(false);

  useEffect(() => {
    if (!addSecondaryOpen) return;
    const onDocPointerDown = (e: PointerEvent) => {
      const el = barRef.current;
      if (el && !el.contains(e.target as Node)) {
        setAddSecondaryOpen(false);
      }
    };
    document.addEventListener('pointerdown', onDocPointerDown, true);
    return () => document.removeEventListener('pointerdown', onDocPointerDown, true);
  }, [addSecondaryOpen]);

  const openAddSecondaryRow = () => {
    if (!disabled) setAddSecondaryOpen(true);
  };

  return (
    <div ref={barRef} className="note-production-action-bar" role="toolbar" aria-label="Note actions">
      <div className="note-production-action-bar__inner">
        <div
          className="note-production-action-bar__chip-cluster"
          onPointerDown={() => openAddSecondaryRow()}
        >
          <IconCards size={15} aria-hidden style={{ opacity: 0.45, flexShrink: 0 }} />
          <div className="note-production-action-bar__chip-wrap" role="group" aria-label="Folder">
            {!collectionUserOverride ? (
              <span className="note-production-action-bar__badge">Auto</span>
            ) : (
              <span className="note-production-action-bar__badge">You</span>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
              <input
                type="text"
                disabled={disabled}
                className="note-production-action-bar__collection-input"
                aria-label="Collection"
                placeholder="No collection"
                value={collectionDraft}
                onChange={(e) => onDraftChange(e.target.value)}
                onFocus={() => openAddSecondaryRow()}
              />
              {extra > 0 ? (
                <span className="note-production-action-bar__plus-n" aria-label={`${extra} additional collections`}>
                  +{extra}
                </span>
              ) : null}
            </div>
          </div>
        </div>
        <div className="note-production-action-bar__chip-actions">
          <button
            type="button"
            disabled={disabled}
            className={`note-production-action-bar__icon-btn${collectionPinned ? ' note-production-action-bar__icon-btn--on' : ''}`}
            title={collectionPinned ? 'Unpin primary collection' : 'Pin primary collection'}
            aria-pressed={collectionPinned}
            onMouseDown={(e) => e.preventDefault()}
            onClick={onTogglePinned}
          >
            {collectionPinned ? <IconPinFilled size={16} /> : <IconPin size={16} />}
          </button>
          <button
            type="button"
            disabled={disabled}
            className="note-production-action-bar__icon-btn"
            title="Restore suggested collection"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onRestoreAuto}
          >
            <IconRotate size={16} />
          </button>
        </div>
      </div>
      {secondaryCollections.length > 0 ? (
        <ul className="note-production-action-bar__secondary-list" aria-label="Additional collections">
          {secondaryCollections.map((name) => (
            <li key={name}>
              <span>{name}</span>
              <button
                type="button"
                disabled={disabled}
                className="note-production-action-bar__secondary-remove"
                onClick={() => onRemoveSecondary(name)}
                aria-label={`Remove ${name}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {addSecondaryOpen ? (
        <div className="note-production-action-bar__add-secondary">
          <input
            type="text"
            disabled={disabled}
            placeholder="Add collection…"
            value={addSecondaryDraft}
            onChange={(e) => onAddSecondaryDraftChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onCommitAddSecondary();
              }
            }}
            aria-label="Add secondary collection"
          />
        </div>
      ) : null}
    </div>
  );
}
