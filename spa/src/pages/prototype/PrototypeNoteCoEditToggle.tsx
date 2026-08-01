/**
 * Author opt-in for co-editing — the control itself, with no section chrome.
 *
 * Mount wherever it should live (Info row, Spaces section, …). Keeping the
 * PATCH + optimistic state here means relocating the toggle later is an import
 * move, not a rewrite.
 */
import { useMemo, useState } from 'react';
import Icon from '@/components/react/Icon';
import { api } from '../../lib/api';

export interface CoEditSpaceRef {
  spaceId: string;
  spaceTitle: string;
}

/**
 * The flag is note-level, so opting in grants edit access to the union of members
 * across every shared space the note sits in. That has to be legible at the moment
 * of consent — hence naming the spaces rather than saying "your shared spaces".
 */
export function coEditHelperText(enabled: boolean, spaces: CoEditSpaceRef[]): string {
  const first = spaces[0]?.spaceTitle?.trim() || 'this space';
  if (!enabled) return `Members of ${first} can read this note.`;
  if (spaces.length <= 1) return `Members of ${first} can edit this note, one person at a time.`;
  const others = spaces.length - 1;
  return `Members of ${first} and ${others} other ${others === 1 ? 'space' : 'spaces'} can edit this note, one person at a time.`;
}

export type PrototypeNoteCoEditToggleLayout = 'row' | 'stack';

export default function PrototypeNoteCoEditToggle({
  noteId,
  coEditEnabled,
  contentEncrypted,
  sharedSpaces,
  layout = 'stack',
  onChanged,
}: {
  noteId: string;
  coEditEnabled: boolean;
  contentEncrypted: boolean;
  sharedSpaces: CoEditSpaceRef[];
  /**
   * `row` — label + switch for an Info-style inspector row (hint omitted;
   * pair with Spaces copy). `stack` — label, switch, and helper in one block.
   */
  layout?: PrototypeNoteCoEditToggleLayout;
  onChanged?: (enabled: boolean) => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [optimistic, setOptimistic] = useState<boolean | null>(null);

  const enabled = optimistic ?? coEditEnabled;
  const helper = useMemo(
    () => (contentEncrypted ? 'Locked notes stay private.' : coEditHelperText(enabled, sharedSpaces)),
    [contentEncrypted, enabled, sharedSpaces],
  );

  // Locked notes are end-to-end encrypted; there's no version of co-editing that
  // works without handing over the key, so this is a hard no rather than a warning.
  const disabled = pending || contentEncrypted;

  const toggle = async () => {
    if (disabled) return;
    const previous = enabled;
    const next = !enabled;
    setPending(true);
    setError(null);
    setOptimistic(next);
    // Notify parent immediately so sibling copy (Spaces helper, Info status)
    // tracks the switch — revert below if the PATCH fails.
    onChanged?.(next);
    try {
      await api.patch(`/api/notes/${noteId}/co-edit`, { enabled: next });
    } catch (err) {
      setOptimistic(null);
      onChanged?.(previous);
      setError(err instanceof Error ? err.message : 'Could not change this setting.');
    } finally {
      setPending(false);
    }
  };

  const switchEl = (
    <span
      className="proto-fte-switch"
      data-on={enabled ? 'true' : 'false'}
      role="switch"
      aria-checked={enabled}
      aria-disabled={disabled}
      aria-label="Let others edit"
      title={layout === 'row' ? helper : undefined}
      tabIndex={disabled ? -1 : 0}
      onClick={() => void toggle()}
      onKeyDown={(e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          void toggle();
        }
      }}
    >
      <span className="proto-fte-switch__thumb" />
    </span>
  );

  if (layout === 'row') {
    return (
      <span className="proto-note-co-edit-toggle proto-note-co-edit-toggle--row">
        {switchEl}
        {error ? (
          <span className="proto-connect-note-sheet__error" role="alert">
            {error}
          </span>
        ) : null}
      </span>
    );
  }

  return (
    <div className="proto-fte-lock proto-note-co-edit-toggle proto-note-co-edit-toggle--stack">
      <label className="proto-fte-lock__row">
        <span className="proto-fte-lock__label">
          <Icon name={enabled ? 'pen' : 'eye'} size={12} aria-hidden />
          Let others edit
        </span>
        {switchEl}
      </label>
      <p className="proto-fte-lock__hint">{helper}</p>
      {error ? (
        <p className="proto-connect-note-sheet__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
