/**
 * Folder + tag editor for the prototype — parity with native
 * FolderChipPopover + NoteInspectorView tag section.
 *
 * Sections:
 *  - Source row (Automatic / Manual badge + "Use auto suggestion")
 *  - Primary folder editor (text field + apply / clear)
 *  - "Also in" — secondary folders with promote / remove
 *  - Add folder input
 *  - Lock primary toggle
 *  - Tags (chips with x + add input)
 *
 * Used by PrototypeInspectorPane and (folder-only mode) by the toolbar popover.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Icon from '@/components/react/Icon';
import type { NoteDetail } from '../../hooks/queries/useNote';
import { useUpdateNote } from '../../hooks/mutations/useUpdateNote';
import { useTagsList } from '../../hooks/queries/useTagsList';
import { useAddTagToNote } from '../../hooks/mutations/useAddTagToNote';
import { useRemoveTagFromNote } from '../../hooks/mutations/useRemoveTagFromNote';
import {
  suggestPrimaryCollectionFromNote,
  suggestSecondaryCollectionsFromNote,
} from '@/utils/bible-study-collection-web';
import { noteFolderChipDisplayState } from '@/utils/note-folder-display';
import { dedupeNoteTagsByName } from '@/utils/dedupe-note-tags';
import type { NoteTagPreview } from '@/utils/bible-study-tag-web';
import { useProtoShell } from '../../layouts/proto-shell-context';
import {
  usePatchSpaceNoteOrganization,
  type NoteCollectionExtras,
  type PatchSpaceNoteOrganizationInput,
} from '../../hooks/mutations/usePatchSpaceNoteOrganization';
import type { UpdateNoteInput } from '../../hooks/mutations/useUpdateNote';
import { APIError } from '../../lib/api';
import { toast } from '@/utils/toast';

interface PrototypeFolderTagEditorProps {
  note: NoteDetail;
  contextSpaceId?: string | null;
  /** When true, only renders the folder editor (no tag section). Used by the toolbar popover and FOLDER inspector section. */
  folderOnly?: boolean;
  /** When true, only renders the tags section. Used by the TAGS inspector section. */
  tagsOnly?: boolean;
}

export type FolderTagPersistenceRequest =
  | { kind: 'shared'; input: PatchSpaceNoteOrganizationInput }
  | { kind: 'personal'; input: UpdateNoteInput };

export function buildFolderTagPersistenceRequest(
  note: NoteDetail,
  patch: NoteCollectionExtras,
  contextSpaceId?: string | null,
): FolderTagPersistenceRequest {
  const context = contextSpaceId?.trim();
  if (context) {
    const organization = note.organization ?? {
      isPinned: false,
      primaryCollection: note.primaryCollection ?? null,
      secondaryCollections: note.secondaryCollections ?? [],
      collectionPinned: note.collectionPinned ?? false,
      order: 0,
    };
    return {
      kind: 'shared',
      input: {
        noteId: note.id,
        spaceId: context,
        primaryCollection:
          patch.primaryCollection !== undefined
            ? patch.primaryCollection
            : organization.primaryCollection,
        secondaryCollections:
          patch.secondaryCollections !== undefined
            ? patch.secondaryCollections
            : organization.secondaryCollections,
        collectionPinned:
          patch.collectionPinned !== undefined
            ? patch.collectionPinned
            : organization.collectionPinned,
      },
    };
  }
  return {
    kind: 'personal',
    input: {
      noteId: note.id,
      title: note.title ?? '',
      content: note.content ?? '',
      ...patch,
    },
  };
}

function trim(s: string | null | undefined): string {
  return (s ?? '').trim();
}

type TagRow = NoteDetail['tags'][number] & Partial<Pick<NoteTagPreview, 'source' | 'matchedPhrase'>>;

function isGhostSubjectTag(tag: TagRow): boolean {
  return (
    tag.id.startsWith('preview:') &&
    tag.source === 'subject' &&
    typeof tag.matchedPhrase === 'string' &&
    tag.matchedPhrase.length > 0
  );
}

function ghostTagTooltip(tag: TagRow): string | undefined {
  if (!isGhostSubjectTag(tag) || !tag.matchedPhrase) return undefined;
  return `Matched: ${tag.matchedPhrase} → ${tag.name}`;
}

function dedupeFolders(list: string[], excludePrimary: string | null): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const primaryKey = excludePrimary ? excludePrimary.toLowerCase() : null;
  for (const raw of list) {
    const t = trim(raw);
    if (!t) continue;
    const k = t.toLowerCase();
    if (primaryKey && k === primaryKey) continue;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

export default function PrototypeFolderTagEditor({
  note,
  contextSpaceId = null,
  folderOnly = false,
  tagsOnly = false,
}: PrototypeFolderTagEditorProps) {
  const showFolder = !tagsOnly;
  const showTags = !folderOnly;
  const updateNote = useUpdateNote();
  const patchSpaceNoteOrganization = usePatchSpaceNoteOrganization();
  const tagsList = useTagsList();
  const addTag = useAddTagToNote();
  const removeTag = useRemoveTagFromNote();
  const { setPrototypeFolderChip } = useProtoShell();

  const contextualOrganization = contextSpaceId?.trim()
    ? note.organization
    : null;
  const serverPrimary = trim(
    contextualOrganization?.primaryCollection ?? note.primaryCollection ?? '',
  );
  const serverSecondaries = dedupeFolders(
    contextualOrganization?.secondaryCollections ?? note.secondaryCollections ?? [],
    serverPrimary || null,
  );
  const isManual = contextSpaceId?.trim() ? true : !!note.collectionUserOverride;
  const isLocked =
    contextualOrganization?.collectionPinned ?? !!note.collectionPinned;
  const folderMutationPending = contextSpaceId?.trim()
    ? patchSpaceNoteOrganization.isPending
    : updateNote.isPending;

  const [primaryDraft, setPrimaryDraft] = useState(serverPrimary);
  const [secondaryDraft, setSecondaryDraft] = useState('');
  const [tagDraft, setTagDraft] = useState('');

  useEffect(() => {
    setPrimaryDraft(serverPrimary);
  }, [serverPrimary]);

  const syncToolbarFolderChip = useCallback(
    (
      patch: {
        primaryCollection?: string | null;
        secondaryCollections?: string[];
      },
    ) => {
      const primary =
        patch.primaryCollection !== undefined ? patch.primaryCollection : (note.primaryCollection ?? null);
      const secondaries =
        patch.secondaryCollections !== undefined
          ? patch.secondaryCollections
          : (note.secondaryCollections ?? []);
      setPrototypeFolderChip({
        noteId: note.id,
        ...noteFolderChipDisplayState({ primaryCollection: primary, secondaryCollections: secondaries }),
      });
    },
    [note.id, note.primaryCollection, note.secondaryCollections, setPrototypeFolderChip],
  );

  const persistFolder = useCallback(
    (patch: {
      primaryCollection?: string | null;
      secondaryCollections?: string[];
      collectionPinned?: boolean;
      collectionUserOverride?: boolean;
    }) => {
      const request = buildFolderTagPersistenceRequest(
        note,
        patch,
        contextSpaceId,
      );
      const options = {
        onSuccess: () => {
          if (
            patch.primaryCollection !== undefined ||
            patch.secondaryCollections !== undefined
          ) {
            syncToolbarFolderChip(patch);
          }
        },
        onError: (error: unknown) => {
          const message =
            error instanceof APIError
              ? error.message
              : error instanceof Error
                ? error.message
                : 'Could not update folders';
          toast.error(message);
        },
      };
      if (request.kind === 'shared') {
        patchSpaceNoteOrganization.mutate(request.input, options);
        return;
      }
      updateNote.mutate(
        request.input,
        {
          ...options,
        },
      );
    },
    [
      contextSpaceId,
      note,
      patchSpaceNoteOrganization,
      syncToolbarFolderChip,
      updateNote,
    ],
  );

  const applyPrimary = () => {
    const next = trim(primaryDraft);
    persistFolder({
      primaryCollection: next.length > 0 ? next : null,
      secondaryCollections: dedupeFolders(serverSecondaries, next || null),
      collectionUserOverride: true,
    });
  };

  const clearPrimary = () => {
    setPrimaryDraft('');
    persistFolder({
      primaryCollection: null,
      collectionUserOverride: true,
    });
  };

  const promoteSecondary = (label: string) => {
    const oldPrimary = serverPrimary;
    const nextSecondaries = serverSecondaries.filter(
      (s) => s.toLowerCase() !== label.toLowerCase(),
    );
    if (oldPrimary) nextSecondaries.unshift(oldPrimary);
    persistFolder({
      primaryCollection: label,
      secondaryCollections: dedupeFolders(nextSecondaries, label),
      collectionUserOverride: true,
    });
  };

  const removeSecondary = (label: string) => {
    persistFolder({
      secondaryCollections: serverSecondaries.filter(
        (s) => s.toLowerCase() !== label.toLowerCase(),
      ),
      collectionUserOverride: true,
    });
  };

  const addSecondary = () => {
    const next = trim(secondaryDraft);
    if (!next) return;
    if (
      next.toLowerCase() === serverPrimary.toLowerCase() ||
      serverSecondaries.some((s) => s.toLowerCase() === next.toLowerCase())
    ) {
      setSecondaryDraft('');
      return;
    }
    persistFolder({
      secondaryCollections: [...serverSecondaries, next],
      collectionUserOverride: true,
    });
    setSecondaryDraft('');
  };

  const toggleLock = () => {
    persistFolder({ collectionPinned: !isLocked });
  };

  const useAutoSuggestion = () => {
    if (folderMutationPending) return;
    const title = note.title ?? '';
    const content = note.content ?? '';
    const sug = suggestPrimaryCollectionFromNote(title, content);
    const secs = suggestSecondaryCollectionsFromNote(title, content, sug);
    setPrimaryDraft(sug ?? '');
    syncToolbarFolderChip({ primaryCollection: sug, secondaryCollections: secs });
    persistFolder({
      primaryCollection: sug,
      secondaryCollections: secs,
      collectionUserOverride: false,
      collectionPinned: false,
    });
  };

  const tags = useMemo(() => dedupeNoteTagsByName(note.tags ?? []), [note.tags]);
  const existingTags = useMemo(() => tagsList.data?.tags ?? [], [tagsList.data]);

  const addTagFromDraft = () => {
    const next = trim(tagDraft);
    if (!next) return;
    if (tags.some((t) => t.name.toLowerCase() === next.toLowerCase())) {
      setTagDraft('');
      return;
    }
    addTag.mutate(
      { noteId: note.id, tagName: next, existingTags },
      { onSuccess: () => setTagDraft('') },
    );
  };

  const acceptGhostTag = (tagName: string) => {
    if (tags.some((t) => t.name.toLowerCase() === tagName.toLowerCase() && !isGhostSubjectTag(t as TagRow))) {
      return;
    }
    addTag.mutate({ noteId: note.id, tagName, existingTags });
  };

  return (
    <div className="proto-folder-tag-editor">
      {showFolder ? (
        <>
      {/* Source row */}
      <div className="proto-fte-source">
        <div className="proto-fte-source__badge">
          <Icon name={isManual ? 'wrench' : 'wand-magic-sparkles'} size={13} aria-hidden />
          <span>{isManual ? 'Manual' : 'Automatic'}</span>
        </div>
        {isManual ? (
          <button
            type="button"
            className="proto-fte-source__action"
            onClick={useAutoSuggestion}
            disabled={folderMutationPending}
            title="Restore auto-suggested folders"
          >
            <Icon name="rotate-left" size={11} aria-hidden />
            {folderMutationPending ? 'Working…' : 'Use auto suggestion'}
          </button>
        ) : null}
      </div>

      {/* Primary */}
      <div className="proto-fte-section">
        <div className="proto-fte-section__label">
          <Icon name="star" size={11} aria-hidden />
          Primary
        </div>
        <div className="proto-fte-field">
          <input
            type="text"
            className="proto-fte-field__input"
            placeholder="No folder"
            value={primaryDraft}
            onChange={(e) => setPrimaryDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                applyPrimary();
              }
            }}
            aria-label="Primary folder"
          />
          <div className="proto-fte-field__actions">
            <button
              type="button"
              className="proto-fte-field__btn proto-fte-field__btn--apply"
              onClick={applyPrimary}
              aria-label="Apply primary folder"
              title="Apply folder"
            >
              <Icon name="check" size={11} aria-hidden />
            </button>
            <button
              type="button"
              className="proto-fte-field__btn proto-fte-field__btn--clear"
              onClick={clearPrimary}
              aria-label="Clear primary folder"
              title="Clear primary"
            >
              <Icon name="xmark" size={11} aria-hidden />
            </button>
          </div>
        </div>
      </div>

      {/* Also in (secondaries) */}
      {serverSecondaries.length > 0 ? (
        <div className="proto-fte-section">
          <div className="proto-fte-section__label proto-fte-section__label--plain">Also in</div>
          <div className="proto-fte-rows">
            {serverSecondaries.map((label) => (
              <div key={label} className="proto-fte-row">
                <Icon name="folder" size={13} className="proto-fte-row__icon" aria-hidden />
                <span className="proto-fte-row__label">{label}</span>
                <div className="proto-fte-action-pair">
                  <button
                    type="button"
                    className="proto-fte-row__btn"
                    onClick={() => promoteSecondary(label)}
                    title={`Make ${label} the primary folder`}
                    aria-label={`Make ${label} the primary folder`}
                  >
                    <Icon name="star" size={13} aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="proto-fte-row__btn proto-fte-row__btn--danger"
                    onClick={() => removeSecondary(label)}
                    title={`Remove ${label}`}
                    aria-label={`Remove ${label}`}
                  >
                    <Icon name="minus" size={13} aria-hidden />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Add folder */}
      <div className="proto-fte-section">
        <div className="proto-fte-section__label proto-fte-section__label--plain">Add folder</div>
        <div className="proto-fte-field">
          <input
            type="text"
            className="proto-fte-field__input"
            placeholder="New folder"
            value={secondaryDraft}
            onChange={(e) => setSecondaryDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addSecondary();
              }
            }}
            aria-label="Add secondary folder"
          />
          <div className="proto-fte-field__actions">
            <button
              type="button"
              className="proto-fte-field__btn proto-fte-field__btn--apply"
              onClick={addSecondary}
              disabled={trim(secondaryDraft).length === 0}
              aria-label="Add secondary folder"
              title="Add folder"
            >
              <Icon name="check" size={11} aria-hidden />
            </button>
            <button
              type="button"
              className="proto-fte-field__btn proto-fte-field__btn--clear"
              onClick={() => setSecondaryDraft('')}
              aria-label="Clear typed folder"
              title="Clear"
            >
              <Icon name="xmark" size={11} aria-hidden />
            </button>
          </div>
        </div>
      </div>

      {/* Lock toggle */}
      <div className="proto-fte-lock">
        <label className="proto-fte-lock__row">
          <span className="proto-fte-lock__label">
            <Icon name={isLocked ? 'lock' : 'unlock'} size={12} aria-hidden />
            Lock primary folder
          </span>
          <span
            className="proto-fte-switch"
            data-on={isLocked ? 'true' : 'false'}
            role="switch"
            aria-checked={isLocked}
            tabIndex={0}
            onClick={toggleLock}
            onKeyDown={(e) => {
              if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                toggleLock();
              }
            }}
          >
            <span className="proto-fte-switch__thumb" />
          </span>
        </label>
        <p className="proto-fte-lock__hint">
          When on, Harvous keeps the primary folder you choose.
        </p>
      </div>

        </>
      ) : null}

      {/* Tags */}
      {showTags ? (
        <div className="proto-fte-section proto-fte-section--tags">
          {tags.length > 0 ? (
            <div className="proto-fte-tag-flow">
              {tags.map((t) => {
                const row = t as TagRow;
                const ghost = isGhostSubjectTag(row);
                const tooltip = ghostTagTooltip(row);
                return (
                  <span
                    key={t.id}
                    className={`proto-fte-tag-chip${ghost ? ' proto-fte-tag-chip--ghost' : ''}`}
                    title={tooltip}
                  >
                    <span className="proto-fte-tag-chip__name">{t.name}</span>
                    {ghost ? (
                      <button
                        type="button"
                        className="proto-fte-tag-chip__accept"
                        onClick={() => acceptGhostTag(t.name)}
                        aria-label={`Confirm tag ${t.name}`}
                        title={tooltip ?? `Confirm ${t.name}`}
                      >
                        <Icon name="check" size={10} aria-hidden />
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="proto-fte-tag-chip__remove"
                        onClick={() => removeTag.mutate({ noteId: note.id, tagName: t.name })}
                        aria-label={`Remove tag ${t.name}`}
                        title={`Remove ${t.name}`}
                      >
                        <Icon name="xmark" size={10} aria-hidden />
                      </button>
                    )}
                  </span>
                );
              })}
            </div>
          ) : (
            <p className="proto-fte-tag-empty">Add a tag to organize this note.</p>
          )}
          <div className="proto-fte-field proto-fte-field--tag">
            <input
              type="text"
              className="proto-fte-field__input"
              placeholder="Add tag"
              value={tagDraft}
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addTagFromDraft();
                }
              }}
              aria-label="Add tag"
            />
            <div className="proto-fte-field__actions">
              <button
                type="button"
                className="proto-fte-field__btn proto-fte-field__btn--apply"
                onClick={addTagFromDraft}
                disabled={trim(tagDraft).length === 0 || addTag.isPending}
                aria-label="Add tag"
                title="Add tag"
              >
                <Icon name="check" size={11} aria-hidden />
              </button>
              <button
                type="button"
                className="proto-fte-field__btn proto-fte-field__btn--clear"
                onClick={() => setTagDraft('')}
                aria-label="Clear typed tag"
                title="Clear"
              >
                <Icon name="xmark" size={11} aria-hidden />
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
