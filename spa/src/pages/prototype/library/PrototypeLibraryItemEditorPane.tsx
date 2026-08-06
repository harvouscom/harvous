/**
 * Add or edit one church resource — the docked rail, same as the planner's.
 *
 * Audience and scope sit together because they are one decision made twice:
 * "who is this for" and "where does it turn up". Splitting them across a sheet
 * and a menu is what made the old shape unanswerable at a glance.
 */
import { useEffect, useRef, useState } from 'react';
import Icon from '@/components/react/Icon';
import { APIError } from '../../../lib/api';
import type { PlannableSpace } from '../../../hooks/useChurchPlannerAccess';
import {
  useChurchLibraryActions,
  type ChurchLibraryStaffItem,
  type LibraryItemAccess,
} from '../../../hooks/queries/useChurchLibrary';
import { useLibraryLinkPreview } from '../../../hooks/queries/useLibrary';

export default function PrototypeLibraryItemEditorPane({
  orgId,
  item,
  plannableSpaces,
  onClose,
}: {
  orgId: string | null;
  /** Null when adding. */
  item: ChurchLibraryStaffItem | null;
  plannableSpaces: PlannableSpace[];
  onClose: () => void;
}) {
  const paneRef = useRef<HTMLElement | null>(null);
  const actions = useChurchLibraryActions(orgId);
  const preview = useLibraryLinkPreview();

  const isEditing = Boolean(item);
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState(item?.title ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [access, setAccess] = useState<LibraryItemAccess>(item?.access ?? 'members');
  /** Empty = the whole church. Any entry narrows it to those rooms. */
  const [spaceIds, setSpaceIds] = useState<string[]>(
    item?.scopes.filter((s) => s.scopeKind === 'space' && s.spaceId).map((s) => s.spaceId!) ?? [],
  );
  const [error, setError] = useState<string | null>(null);

  /* Escape closes the pane, not the whole surface — the panel's own listener
     stands down on `defaultPrevented`. Same contract as the planner's pane. */
  useEffect(() => {
    const pane = paneRef.current;
    if (!pane) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      onClose();
    };
    pane.addEventListener('keydown', onKeyDown);
    return () => pane.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const toggleSpace = (spaceId: string) => {
    setSpaceIds((ids) =>
      ids.includes(spaceId) ? ids.filter((id) => id !== spaceId) : [...ids, spaceId],
    );
  };

  const scopePayload = () =>
    spaceIds.length === 0
      ? [{ scopeKind: 'org' as const, spaceId: null }]
      : spaceIds.map((spaceId) => ({ scopeKind: 'space' as const, spaceId }));

  const canSubmit = isEditing
    ? title.trim().length > 0 && !actions.isPending
    : url.trim().length > 0 && !actions.isPending;

  const submit = () => {
    if (!canSubmit) return;
    setError(null);
    const onError = (err: unknown) =>
      setError(
        err instanceof APIError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Could not save this resource.',
      );

    if (isEditing && item) {
      actions.mutate(
        {
          kind: 'update',
          id: item.id,
          title: title.trim(),
          description: description.trim() || null,
          access,
          scopes: scopePayload(),
        },
        { onSuccess: () => onClose(), onError },
      );
      return;
    }

    actions.mutate(
      {
        kind: 'create',
        url: url.trim(),
        title: title.trim() || null,
        description: description.trim() || null,
        siteName: preview.data?.siteName ?? null,
        image: preview.data?.image ?? null,
        access,
        scopes: scopePayload(),
      },
      { onSuccess: () => onClose(), onError },
    );
  };

  const remove = () => {
    if (!item) return;
    if (!window.confirm(`Remove ${item.title} from the library? Notes that cite it keep working.`)) {
      return;
    }
    setError(null);
    actions.mutate(
      { kind: 'archive', id: item.id },
      { onSuccess: () => onClose(), onError: (err) => setError(String(err)) },
    );
  };

  return (
    <aside ref={paneRef} className="proto-planner-editor" aria-label={isEditing ? 'Edit resource' : 'Add a resource'}>
      <div className="proto-side-panel__header proto-side-panel__header--minimal">
        <span className="proto-side-panel__header-label">
          <Icon name="newspaper" size={13} aria-hidden />
          {isEditing ? 'Edit resource' : 'Add a resource'}
        </span>
        <div className="proto-side-panel__header-actions">
          <button
            type="button"
            className="proto-side-panel__action-btn"
            title="Close"
            aria-label="Close editor"
            onClick={onClose}
          >
            <Icon name="xmark" size={12} />
          </button>
        </div>
      </div>

      <div className="proto-planner-editor__body proto-create-folder-sheet">
        <div className="proto-service-editor">
          {!isEditing ? (
            <>
              <label
                className="proto-inspector-section-title proto-create-folder-sheet__field-label"
                htmlFor="proto-library-url"
              >
                Link
              </label>
              <input
                id="proto-library-url"
                type="url"
                className="proto-create-folder-sheet__name-input"
                value={url}
                placeholder="https://"
                autoComplete="off"
                onChange={(e) => {
                  setUrl(e.target.value);
                  setError(null);
                }}
                onBlur={() => {
                  const trimmed = url.trim();
                  if (!trimmed) return;
                  /* Best-effort title fill — the server re-validates the URL
                     regardless, so a failed preview costs nothing. */
                  preview.mutate(trimmed, {
                    onSuccess: (data) => {
                      if (!title.trim() && data?.title) setTitle(data.title);
                    },
                  });
                }}
              />
            </>
          ) : null}

          <label
            className="proto-inspector-section-title proto-create-folder-sheet__field-label"
            htmlFor="proto-library-title"
          >
            Title
          </label>
          <input
            id="proto-library-title"
            type="text"
            className="proto-create-folder-sheet__name-input"
            value={title}
            placeholder="What is this?"
            onChange={(e) => {
              setTitle(e.target.value);
              setError(null);
            }}
          />

          <label
            className="proto-inspector-section-title proto-create-folder-sheet__field-label"
            htmlFor="proto-library-description"
          >
            <span>Note</span>
            <span className="proto-service-editor__optional">optional</span>
          </label>
          <input
            id="proto-library-description"
            type="text"
            className="proto-create-folder-sheet__name-input"
            value={description}
            placeholder="Why your church keeps this"
            onChange={(e) => setDescription(e.target.value)}
          />

          <label className="proto-inspector-section-title proto-create-folder-sheet__field-label">
            Who can see it
          </label>
          <div className="proto-chip-bar" role="radiogroup" aria-label="Audience">
            <button
              type="button"
              role="radio"
              aria-checked={access === 'members'}
              className={`proto-chip${access === 'members' ? ' proto-chip--selected' : ''}`}
              onClick={() => setAccess('members')}
            >
              Everyone
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={access === 'leaders'}
              className={`proto-chip${access === 'leaders' ? ' proto-chip--selected' : ''}`}
              onClick={() => setAccess('leaders')}
            >
              Leaders only
            </button>
          </div>

          {plannableSpaces.length > 0 ? (
            <>
              <label className="proto-inspector-section-title proto-create-folder-sheet__field-label">
                <span>Where it shows up</span>
                <span className="proto-service-editor__optional">
                  {spaceIds.length === 0 ? 'whole church' : `${spaceIds.length} selected`}
                </span>
              </label>
              {/* No "whole church" checkbox: it is what an empty selection
                  means, and a checkbox that unchecks itself when you pick a
                  room is a worse explanation than the caption above. */}
              <div className="proto-service-editor__slots" role="group" aria-label="Rooms">
                {plannableSpaces.map((space) => (
                  <label key={space.id} className="proto-service-editor__slot">
                    <input
                      type="checkbox"
                      checked={spaceIds.includes(space.id)}
                      onChange={() => toggleSpace(space.id)}
                    />
                    <span>{space.title}</span>
                  </label>
                ))}
              </div>
            </>
          ) : null}
        </div>

        {error ? (
          <p className="proto-connect-note-sheet__error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="proto-add-notes-sheet__footer proto-sheet-footer--stacked">
          <button
            type="button"
            className="proto-share-popover__primary"
            disabled={!canSubmit}
            onClick={submit}
          >
            {actions.isPending ? 'Saving…' : isEditing ? 'Save' : 'Add to library'}
          </button>
          {isEditing ? (
            <button
              type="button"
              className="proto-sheet-quiet-action proto-sheet-quiet-action--danger"
              disabled={actions.isPending}
              onClick={remove}
            >
              Remove from library
            </button>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
