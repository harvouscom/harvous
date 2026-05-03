import React from 'react';
import { CardsThree, Info } from '@phosphor-icons/react';

export interface PrototypeNoteActionBarProps {
  /** Display collection / theme label (read-only; editing deferred to classic app). */
  collectionLabel: string | null;
  /** Optional: focus inspector in prototype shell. */
  onOpenInspector?: () => void;
}

/**
 * Prototype-only bottom note chrome — collection-first native parity.
 */
export default function PrototypeNoteActionBar({
  collectionLabel,
  onOpenInspector,
}: PrototypeNoteActionBarProps) {
  const label = collectionLabel?.trim() ? collectionLabel : 'No collection';

  return (
    <div className="proto-note-action-bar" role="toolbar" aria-label="Note actions">
      <div className="proto-note-action-bar__inner">
        <div className="proto-note-action-bar__chip" title="Collection">
          <CardsThree size={14} style={{ opacity: 0.5, flexShrink: 0 }} aria-hidden />
          <span className="proto-note-action-bar__chip-label">{label}</span>
        </div>
        <span className="proto-note-action-bar__spacer" />
        {onOpenInspector ? (
          <button
            type="button"
            className="proto-note-action-bar__icon-btn"
            onClick={onOpenInspector}
            title="Note details"
            aria-label="Open note details"
          >
            <Info size={14} />
          </button>
        ) : null}
      </div>
    </div>
  );
}
