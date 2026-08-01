/**
 * Author opt-in for co-editing on one shared-space association.
 *
 * Compact switch for a Spaces list row. The PATCH targets
 * SpaceNotes.coEditEnabled; Notes.coEditEnabled is the server's OR-mirror.
 */
import { useState } from 'react';
import { api } from '../../lib/api';

export interface CoEditSpaceRef {
  spaceId: string;
  spaceTitle: string;
  coEditEnabled: boolean;
}

/** Tooltip / a11y copy for the per-space switch. */
export function coEditHelperTextForSpace(enabled: boolean, spaceTitle: string): string {
  const name = spaceTitle.trim() || 'this space';
  if (!enabled) return `Members of ${name} can read this note. Turn on to let them edit.`;
  return `Members of ${name} can edit, one person at a time.`;
}

export default function PrototypeNoteCoEditToggle({
  noteId,
  spaceId,
  spaceTitle,
  coEditEnabled,
  contentEncrypted,
  onChanged,
}: {
  noteId: string;
  spaceId: string;
  spaceTitle: string;
  coEditEnabled: boolean;
  contentEncrypted: boolean;
  onChanged?: (enabled: boolean, noteCoEditEnabled: boolean) => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [optimistic, setOptimistic] = useState<boolean | null>(null);

  const enabled = optimistic ?? coEditEnabled;
  const helper = contentEncrypted
    ? 'Locked notes stay private.'
    : coEditHelperTextForSpace(enabled, spaceTitle);

  const disabled = pending || contentEncrypted;

  const toggle = async () => {
    if (disabled) return;
    const previous = enabled;
    const next = !enabled;
    setPending(true);
    setError(null);
    setOptimistic(next);
    try {
      const res = await api.patch<{
        success?: boolean;
        coEditEnabled?: boolean;
        noteCoEditEnabled?: boolean;
      }>(`/api/notes/${noteId}/co-edit`, { enabled: next, spaceId });
      onChanged?.(next, res.noteCoEditEnabled === true);
    } catch (err) {
      setOptimistic(null);
      onChanged?.(previous, previous);
      setError(err instanceof Error ? err.message : 'Could not change this setting.');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="proto-inspector-space-co-edit">
      <div className="proto-inspector-space-co-edit__control">
        <span className="proto-inspector-space-co-edit__label" title={helper}>
          Let others edit
        </span>
        <span
          className="proto-fte-switch"
          data-on={enabled ? 'true' : 'false'}
          role="switch"
          aria-checked={enabled}
          aria-disabled={disabled}
          aria-label={`Let others edit in ${spaceTitle.trim() || 'this space'}`}
          title={helper}
          tabIndex={disabled ? -1 : 0}
          onClick={(e) => {
            e.stopPropagation();
            void toggle();
          }}
          onKeyDown={(e) => {
            if (e.key === ' ' || e.key === 'Enter') {
              e.preventDefault();
              e.stopPropagation();
              void toggle();
            }
          }}
        >
          <span className="proto-fte-switch__thumb" />
        </span>
      </div>
      {error ? (
        <p className="proto-connect-note-sheet__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
