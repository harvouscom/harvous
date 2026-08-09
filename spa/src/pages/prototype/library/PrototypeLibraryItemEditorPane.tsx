/**
 * Add or edit one church resource — the docked rail, same as the planner's.
 *
 * Audience and scope sit together because they are one decision made twice:
 * "who is this for" and "where does it turn up". Splitting them across a sheet
 * and a menu is what made the old shape unanswerable at a glance.
 */
import { useEffect, useRef, useState } from 'react';
import ProtoConfirmDialog from '../ProtoConfirmDialog';
import Icon from '@/components/react/Icon';
import { APIError } from '../../../lib/api';
import type { PlannableSpace } from '../../../hooks/useChurchPlannerAccess';
import {
  useChurchLibraryActions,
  type ChurchLibraryStaffItem,
  type LibraryItemAccess,
} from '../../../hooks/queries/useChurchLibrary';
import { useLibraryLinkPreview } from '../../../hooks/queries/useLibrary';
import ProtoChipBar from '../components/ProtoChipBar';
import { formatFileSize } from '../import/import-file-sources';

type ResourceSource = 'link' | 'file';

const SOURCE_OPTIONS = [
  { id: 'link' as const, label: 'A link' },
  { id: 'file' as const, label: 'A file' },
];

/**
 * Pick or drop one file, in the import surface's language — paper, ink, a drop
 * target you can also click.
 *
 * One file, not a queue: a library entry is a single resource, so the row
 * replaces the drop zone once something is chosen rather than stacking under it.
 */
function ResourceFileField({
  file,
  onPick,
  onClear,
}: {
  file: File | null;
  onPick: (file: File | null) => void;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);
  /* Counted, so a drag crossing a child element doesn't flicker the state. */
  const dragDepth = useRef(0);
  const hasFiles = (e: React.DragEvent) => e.dataTransfer?.types?.includes('Files');

  if (file) {
    return (
      <div className="proto-resource-file-row">
        <span className="proto-resource-file-row__ext" aria-hidden>
          {(file.name.split('.').pop() || 'file').slice(0, 4)}
        </span>
        <span className="proto-resource-file-row__body">
          <span className="proto-resource-file-row__name" title={file.name}>
            {file.name}
          </span>
          <span className="proto-resource-file-row__size">{formatFileSize(file.size)}</span>
        </span>
        <button
          type="button"
          className="proto-import-row__icon-btn"
          onClick={onClear}
          aria-label={`Remove ${file.name}`}
        >
          <Icon name="xmark" size={13} aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      className={`proto-resource-file-drop${dragOver ? ' proto-resource-file-drop--active' : ''}`}
      onClick={() => inputRef.current?.click()}
      onDragEnter={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        dragDepth.current += 1;
        setDragOver(true);
      }}
      onDragOver={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }}
      onDragLeave={(e) => {
        if (!hasFiles(e)) return;
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragOver(false);
      }}
      onDrop={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        dragDepth.current = 0;
        setDragOver(false);
        onPick(e.dataTransfer.files?.[0] ?? null);
      }}
    >
      <span className="proto-resource-file-drop__sheet" aria-hidden>
        <span className="proto-resource-file-drop__rule" style={{ width: '78%' }} />
        <span className="proto-resource-file-drop__rule" style={{ width: '56%' }} />
        <span className="proto-resource-file-drop__rule" style={{ width: '68%' }} />
      </span>
      <span className="proto-resource-file-drop__label">
        {dragOver ? 'Release to attach' : 'Drop a file, or click to choose'}
      </span>
      <span className="proto-resource-file-drop__hint">PDF, Word, slides, images — up to 50MB</span>
      <input
        ref={inputRef}
        type="file"
        hidden
        onChange={(e) => {
          onPick(e.target.files?.[0] ?? null);
          // Cleared so picking the same file twice still fires a change.
          e.target.value = '';
        }}
      />
    </button>
  );
}

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
  const [source, setSource] = useState<ResourceSource>('link');
  const [file, setFile] = useState<File | null>(null);
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

  /** Filename minus extension is usually the title someone would have typed. */
  const adoptFile = (picked: File | null) => {
    if (!picked) return;
    setFile(picked);
    setError(null);
    if (!title.trim()) setTitle(picked.name.replace(/\.[^.]+$/, ''));
  };

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
    : !actions.isPending && (source === 'file' ? file != null : url.trim().length > 0);

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

    if (source === 'file') {
      if (!file) return;
      actions.mutate(
        {
          kind: 'upload',
          file,
          title: title.trim() || null,
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

  const [removeAnchor, setRemoveAnchor] = useState<DOMRect | null>(null);

  const remove = () => {
    if (!item) return;
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
          {/* Source is only a question when adding — an existing item is already
              one or the other, and changing it would be a different resource. */}
          {!isEditing ? (
            <>
              <label className="proto-inspector-section-title proto-create-folder-sheet__field-label">
                What are you adding
              </label>
              <ProtoChipBar
                ariaLabel="Resource source"
                options={SOURCE_OPTIONS}
                selectedId={source}
                onSelect={(next) => {
                  setSource(next);
                  setError(null);
                }}
              />
            </>
          ) : null}

          {!isEditing && source === 'link' ? (
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

          {!isEditing && source === 'file' ? (
            <>
              <label className="proto-inspector-section-title proto-create-folder-sheet__field-label">
                File
              </label>
              <ResourceFileField
                file={file}
                onPick={adoptFile}
                onClear={() => {
                  setFile(null);
                  setError(null);
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
                {spaceIds.length > 0 ? (
                  <span className="proto-service-editor__optional">
                    {spaceIds.length} selected
                  </span>
                ) : null}
              </label>
              {/* "Whole church" is a row you can pick, not a caption off to the
                  side. It stays a checkbox rather than a radio: the rooms below it
                  are genuinely multi-select, and one radio sitting above two
                  checkboxes — all of them circles — reads as "pick exactly one".
                  It behaves like the "All" row in a filter list: choosing it clears
                  the rooms, and choosing a room clears it. */}
              <div className="proto-service-editor__slots" role="group" aria-label="Where it shows up">
                <label className="proto-service-editor__slot">
                  <input
                    type="checkbox"
                    checked={spaceIds.length === 0}
                    // Already the state — clicking again would leave it nowhere.
                    onChange={() => setSpaceIds([])}
                  />
                  <span>Whole church</span>
                </label>
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
              onClick={(e) => setRemoveAnchor(e.currentTarget.getBoundingClientRect())}
            >
              Remove from library
            </button>
          ) : null}
        </div>
      </div>
      {/* Anchored to the button that raised it, like every other destructive
          confirm in the prototype. This used to be `window.confirm` — an OS
          dialog with its own type, radius and buttons, dropped into the middle
          of a surface that has spent every other pixel not looking like that. */}
      {removeAnchor ? (
        <ProtoConfirmDialog
          anchorRect={removeAnchor}
          preferAbove
          alignRight
          title={`Remove ${item?.title ?? "this"} from the library?`}
          description="Notes that cite it keep working."
          confirmLabel="Remove"
          busy={actions.isPending}
          onConfirm={() => {
            setRemoveAnchor(null);
            remove();
          }}
          onCancel={() => setRemoveAnchor(null)}
        />
      ) : null}
    </aside>

  );
}
