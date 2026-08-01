import { useMemo, useState } from 'react';
import Icon from '@/components/react/Icon';
import { PrototypeSectionHeader } from './design-system';
import { api } from '../../lib/api';

/**
 * Author's opt-in for co-editing. Author-only and deliberately quiet: it lives in
 * the inspector next to lock and delete rather than in the editor chrome, because
 * it's a per-note decision made once, not a control you reach for while writing.
 */
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

export default function PrototypeInspectorCoEditSection({
  noteId,
  coEditEnabled,
  contentEncrypted,
  sharedSpaces,
  onChanged,
}: {
  noteId: string;
  coEditEnabled: boolean;
  contentEncrypted: boolean;
  sharedSpaces: CoEditSpaceRef[];
  onChanged?: (enabled: boolean) => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [optimistic, setOptimistic] = useState<boolean | null>(null);

  const enabled = optimistic ?? coEditEnabled;
  const helper = useMemo(
    () => coEditHelperText(enabled, sharedSpaces),
    [enabled, sharedSpaces],
  );

  // Locked notes are end-to-end encrypted; there's no version of co-editing that
  // works without handing over the key, so this is a hard no rather than a warning.
  const disabled = pending || contentEncrypted;

  const toggle = async () => {
    if (disabled) return;
    const next = !enabled;
    setPending(true);
    setError(null);
    setOptimistic(next);
    try {
      await api.patch(`/api/notes/${noteId}/co-edit`, { enabled: next });
      onChanged?.(next);
    } catch (err) {
      setOptimistic(null);
      setError(err instanceof Error ? err.message : 'Could not change this setting.');
    } finally {
      setPending(false);
    }
  };

  return (
    <section className="proto-inspector-section">
      <PrototypeSectionHeader>Editing</PrototypeSectionHeader>
      <div className="proto-fte-lock">
        <label className="proto-fte-lock__row">
          <span className="proto-fte-lock__label">
            <Icon name={enabled ? 'pen' : 'eye'} size={12} aria-hidden />
            Let others edit
          </span>
          <span
            className="proto-fte-switch"
            data-on={enabled ? 'true' : 'false'}
            role="switch"
            aria-checked={enabled}
            aria-disabled={disabled}
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
        </label>
        <p className="proto-fte-lock__hint">
          {contentEncrypted ? 'Locked notes stay private.' : helper}
        </p>
        {error ? (
          <p className="proto-connect-note-sheet__error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </section>
  );
}
