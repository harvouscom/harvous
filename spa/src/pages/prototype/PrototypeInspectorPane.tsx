/**
 * Prototype inspector pane — mirrors native NoteInspectorView.
 * Sections: Info · Spaces (when shared) · Tags · Thread · Folders
 * Standalone — no SPA CSS variables or shared styles.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';
import { useAuth, useUser } from '@clerk/clerk-react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useRouterState } from '@tanstack/react-router';
import PrototypeNoteCoEditToggle, { type CoEditSpaceRef } from './PrototypeNoteCoEditToggle';
import { formatNoteContributors } from '../../lib/shared-space-capabilities';
import { prototypeHomeRouteTo, prototypeNoteRouteTo, prototypeSettingsAccountRouteTo } from '@/lib/prototype-path';
import { toPrototypeSpaceSearchParam } from '../../utils/prototype-space-api-id';
import type { NoteDetail, LinkedNoteRef } from '../../hooks/queries/useNote';
import type { NoteActivityItem } from '../../lib/shared-note-activity-list';
import { normalizeNoteAddedBy } from '@/utils/note-added-by-display';
import { resolveClerkProfileImageUrl } from '../../lib/clerk-profile-image';
import { storeSettingsOpenerPath } from '../../lib/prototype-settings-opener';
import { useProfile } from '../../hooks/queries/useProfile';
import { useForeignSharedNote } from '../../hooks/useForeignSharedNote';
import { stripServerAutoUntitledNoteTitleForDisplay } from '@/utils/server-auto-untitled-note-display';
import Icon from '@/components/react/Icon';
import { toast } from '@/utils/toast';
import { APIError } from '../../lib/api';
import { useDeleteNote } from '../../hooks/mutations/useDeleteNote';
import { useRemoveNoteFromSpace } from '../../hooks/mutations/useSpaceNoteAssociation';
import { useDisconnectNote } from '../../hooks/mutations/useDisconnectNote';
import { useConnectNote } from '../../hooks/mutations/useConnectNote';
import ProtoNoteSearch from './ProtoNoteSearch';
import { useNavigationSharedSpaceAccess } from '../../hooks/queries/useNavigation';
import { useProtoShell } from '../../layouts/proto-shell-context';
import PrototypeFolderTagEditor from './PrototypeFolderTagEditor';
import { useHarvousIdentity } from '../../hooks/useHarvousIdentity';
import { offerGuestAccount } from '../../lib/guest-gate';
import ProtoConfirmDialog from './ProtoConfirmDialog';
import SharedSpaceNoteAuthorChip from './SharedSpaceNoteAuthorChip';
import SharedNoteActivityPanel from './SharedNoteActivityPanel';
import PrototypeInspectorTemplatesSection, {
  type PrototypeInspectorTemplatesSectionProps,
} from './PrototypeInspectorTemplatesSection';
import PrototypeInspectorTeachingPlanSection, {
  type PrototypeInspectorTeachingPlanSectionProps,
} from './PrototypeInspectorTeachingPlanSection';
import PrototypeInspectorPublishedForSection, {
  type PrototypeInspectorPublishedForSectionProps,
} from './PrototypeInspectorPublishedForSection';
import ProtoSpaceMenuIcon from './ProtoSpaceMenuIcon';
import { PrototypeSectionHeader } from './design-system';
import { noteParamSlug } from './proto-route-slugs';
import { isConfirmedForeignNote } from './proto-note-ownership';
import { PROTOTYPE_NOTE_LIST_NAV_SEARCH } from '@/utils/prototype-sidebar-highlight-active';
import {
  flattenNoteTemplatesForPicker,
  useNoteTemplates,
  type ApplyableNoteTemplate,
} from '../../hooks/queries/useNoteTemplates';
import {
  NOTE_TEMPLATE_ICON_NAME,
  resolveNoteTemplateIconColor,
} from '@/utils/note-template-icon';
import { toastError } from '../../lib/error-copy';
import {
  DELETE_NOTE_EVERYWHERE_CONFIRMATION,
  REMOVE_NOTE_FROM_SPACE_CONFIRMATION as SHARED_REMOVE_NOTE_FROM_SPACE_CONFIRMATION,
} from './proto-destructive-copy';

/**
 * A section a guest can see but not use yet.
 *
 * Shown rather than hidden: the inspector is where someone learns what a note *has*, and a
 * missing section teaches nothing. The editors behind these all write through the server, so
 * for a guest they used to 401 and roll back — a row that looked like it worked and did not.
 */
function PrototypeInspectorGuestRow({ what }: { what: string }) {
  return (
    <button
      type="button"
      className="proto-inspector-templates__action-secondary"
      onClick={() => offerGuestAccount(what)}
    >
      {what} need a free account
    </button>
  );
}

/**
 * What the pane hands the templates section — which is exactly what the section takes.
 *
 * This was a second, hand-maintained copy of the section's own props, and it had already
 * drifted: `churchOrgId` and `canManageChurchTemplates` were missing here while the pane
 * spread them straight through, so two real props travelled untyped. An alias cannot drift.
 */
export type PrototypeInspectorTemplatesProps = PrototypeInspectorTemplatesSectionProps;

interface PrototypeInspectorPaneProps {
  note: NoteDetail;
  spaceId?: string;
  contextSpaceId?: string | null;
  sharedSpaceId?: string | null;
  noteAuthorUserId?: string | null;
  noteAuthorDisplayName?: string | null;
  onSelectActivity?: (item: NoteActivityItem) => void;
  activeActivityId?: string | null;
  /** Draft compose — light inspector (Templates + muted Info). */
  isDraftCompose?: boolean;
  templates?: PrototypeInspectorTemplatesProps | null;
  /**
   * Present only for a viewer the server says holds `manage_teaching_plan`.
   * Null for everyone else, which is what keeps sermon tooling out of the
   * general note inspector.
   */
  teachingPlan?: PrototypeInspectorTeachingPlanSectionProps | null;
  /**
   * "Published for" — present only for a note that lives in a ministry channel
   * this viewer may author in. Null everywhere else, for the same reason
   * `teachingPlan` is: a congregant following the channel must not see the
   * attach control, and the server would 404 it anyway.
   */
  publishedFor?: PrototypeInspectorPublishedForSectionProps | null;
}

export const REMOVE_NOTE_FROM_SPACE_CONFIRMATION = SHARED_REMOVE_NOTE_FROM_SPACE_CONFIRMATION;

export const DELETE_CANONICAL_NOTE_CONFIRMATION = DELETE_NOTE_EVERYWHERE_CONFIRMATION;

export function resolveInspectorNoteAction(input: {
  sharedSpaceId: string | null;
  isNoteAuthor: boolean;
  isSpaceOwner: boolean;
}): 'remove-from-space' | 'delete-everywhere' | null {
  if (input.sharedSpaceId) {
    return input.isNoteAuthor || input.isSpaceOwner ? 'remove-from-space' : null;
  }
  return input.isNoteAuthor ? 'delete-everywhere' : null;
}

export default function PrototypeInspectorPane({
  note,
  spaceId = '',
  contextSpaceId = null,
  sharedSpaceId = null,
  noteAuthorUserId = null,
  noteAuthorDisplayName = null,
  onSelectActivity,
  activeActivityId = null,
  isDraftCompose = false,
  templates = null,
  teachingPlan = null,
  publishedFor = null,
}: PrototypeInspectorPaneProps) {
  const { userId: authUserId } = useAuth();
  const queryClient = useQueryClient();
  const [connectOpen, setConnectOpen] = useState(false);
  const connectNote = useConnectNote();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const deleteAnchorRef = useRef<HTMLElement | null>(null);
  const navigate = useNavigate();
  const { closeInspector, closeDrawer, isMobileSidebar, openStudyThreadPopover } = useProtoShell();
  const deleteNote = useDeleteNote();
  const removeFromSpace = useRemoveNoteFromSpace();
  const { access: sharedSpaceAccess } = useNavigationSharedSpaceAccess(sharedSpaceId);

  const isForeignNote = isConfirmedForeignNote(note, authUserId);
  const isNoteAuthor =
    note.isOwnNote === true ||
    Boolean(authUserId && (note.authorUserId ?? note.userId) === authUserId);
  const destructiveAction = resolveInspectorNoteAction({
    sharedSpaceId,
    isNoteAuthor,
    isSpaceOwner: sharedSpaceAccess?.isOwner === true,
  });
  const actionPending = deleteNote.isPending || removeFromSpace.isPending;

  const onActionConfirm = () => {
    if (destructiveAction === 'remove-from-space' && sharedSpaceId) {
      removeFromSpace.mutate(
        { noteId: note.id, spaceId: sharedSpaceId },
        {
          onSuccess: () => {
            setDeleteConfirmOpen(false);
            closeInspector();
            if (isForeignNote) {
              navigate({ to: prototypeHomeRouteTo(), replace: true });
            } else {
              navigate({
                to: prototypeNoteRouteTo(),
                params: { noteId: noteParamSlug(note.id) },
                search: PROTOTYPE_NOTE_LIST_NAV_SEARCH,
                replace: true,
              });
            }
            if (isMobileSidebar) closeDrawer({ preserveHistory: true });
          },
          onError: (err) => {
            setDeleteConfirmOpen(false);
            toastError(err, 'Could not remove note from this space');
          },
        },
      );
      return;
    }
    if (destructiveAction !== 'delete-everywhere' || !spaceId) return;
    deleteNote.mutate(
      { noteId: note.id, spaceId },
      {
        onSuccess: () => {
          setDeleteConfirmOpen(false);
          closeInspector();
          navigate({ to: prototypeHomeRouteTo(), replace: true });
          if (isMobileSidebar) closeDrawer({ preserveHistory: true });
        },
        onError: (err) => {
          setDeleteConfirmOpen(false);
          toastError(err, 'Could not delete note');
        },
      },
    );
  };

  const createdStr = note.createdAt ? formatDate(new Date(note.createdAt)) : '—';
  const modifiedSource = note.updatedAt ?? note.createdAt;
  const updatedStr = modifiedSource ? formatDate(new Date(modifiedSource)) : '—';

  const wordCount = estimateWords((templates?.liveContent ?? note.content) ?? '');
  // Null unless someone other than the author has actually saved a checkpoint, so
  // an opted-in note nobody has touched yet stays quiet.
  const contributorsLine = useMemo(
    () =>
      formatNoteContributors(
        note.contributors ?? [],
        note.authorUserId ?? note.userId ?? null,
        authUserId,
      ),
    [note.contributors, note.authorUserId, note.userId, authUserId],
  );
  // Author-only Spaces section: each *shared* association owns its own co-edit
  // toggle. Ministry channels (type public) are visibility-only.
  const coEditSpaces = useMemo<CoEditSpaceRef[]>(
    () =>
      (note.spaces ?? [])
        .filter((space) => (space.spaceType ?? 'shared') === 'shared')
        .map((space) => ({
          spaceId: space.id,
          spaceTitle: space.title,
          coEditEnabled: space.coEditEnabled === true,
        })),
    [note.spaces],
  );
  const showSpacesSection =
    !isForeignNote && !isDraftCompose && coEditSpaces.length > 0;
  const [spaceCoEditById, setSpaceCoEditById] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(coEditSpaces.map((s) => [s.spaceId, s.coEditEnabled])),
  );
  useEffect(() => {
    setSpaceCoEditById(
      Object.fromEntries(
        (note.spaces ?? [])
          .filter((space) => (space.spaceType ?? 'shared') === 'shared')
          .map((space) => [space.id, space.coEditEnabled === true]),
      ),
    );
  }, [note.id, note.spaces]);
  const onSpaceCoEditChanged = useCallback(
    (spaceId: string, enabled: boolean) => {
      setSpaceCoEditById((prev) => ({ ...prev, [spaceId]: enabled }));
      void queryClient.invalidateQueries({ queryKey: ['note', note.id] });
    },
    [queryClient, note.id],
  );
  const { isGuest } = useHarvousIdentity();
  const templateFromId = (
    templates?.startedFromTemplateId ??
    note.startedFromTemplateId ??
    ''
  ).trim();
  const templateFromName = (
    templates?.startedFromTemplateName ??
    note.startedFromTemplateName ??
    ''
  ).trim();
  const showTemplateFrom = Boolean(templateFromId && templateFromName);
  /*
   * The note row carries the template's id and name, not its colour, and the resolver's
   * fallback for an unknown id is a hash of that id — so a saved template's tile here was an
   * arbitrary colour that had nothing to do with the one chosen when it was saved. Same query
   * key the Browse sheet uses, so this is the cache it already filled, not a second fetch.
   */
  const { data: templatesData } = useNoteTemplates(templates?.spaceId ?? null, showTemplateFrom);
  const templateFromIconColor = useMemo(
    () =>
      flattenNoteTemplatesForPicker(templatesData).find((t) => t.id === templateFromId)?.iconColor ??
      null,
    [templatesData, templateFromId],
  );

  const linkedFromNotes = note.linkedFromNotes ?? [];
  const linkedToNotes = note.linkedToNotes ?? [];
  const hasConnections = linkedFromNotes.length > 0 || linkedToNotes.length > 0;
  const connectedNoteIds = useMemo(
    () => [...linkedFromNotes.map((n) => n.id), ...linkedToNotes.map((n) => n.id)],
    [linkedFromNotes, linkedToNotes],
  );

  const showActivityPanel = typeof onSelectActivity === 'function';

  const templateFromRow = showTemplateFrom ? (
    <InspectorRow
      label="Template"
      value={
        <span className="proto-inspector-template-from">
          <span className="proto-inspector-template-from__icon" aria-hidden>
            <ProtoSpaceMenuIcon
              color={resolveNoteTemplateIconColor(templateFromId, templateFromIconColor)}
              iconName={NOTE_TEMPLATE_ICON_NAME}
              size={16}
              radius={4}
              glyphSize={8}
            />
          </span>
          {templateFromName}
        </span>
      }
    />
  ) : null;

  return (
    <div className="proto-inspector">
      <section className="proto-inspector-section">
        <PrototypeSectionHeader>Info</PrototypeSectionHeader>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {isDraftCompose ? (
            <>
              <InspectorRow label="Status" value="Draft" />
              <InspectorRow label="Words" value={String(wordCount)} />
              {templateFromRow}
            </>
          ) : (
            <>
              {note.simpleNoteId != null ? (
                <InspectorSimpleNoteIdRow simpleNoteId={note.simpleNoteId} />
              ) : null}
              <InspectorRow label="Created" value={createdStr} />
              <InspectorRow
                label="Added by"
                value={<InspectorAddedByValue note={note} contextSpaceId={contextSpaceId} />}
              />
              <InspectorRow label="Edited" value={updatedStr} />
              {contributorsLine ? (
                <InspectorRow label="Written by" value={contributorsLine} />
              ) : null}
              <InspectorRow label="Words" value={String(wordCount)} />
              {templateFromRow}
              {note.noteType && note.noteType !== 'default' ? (
                <InspectorRow label="Type" value={capitalize(note.noteType)} />
              ) : null}
              {note.isPublic ? (
                <InspectorRow label="Sharing" value="Anyone with link" />
              ) : null}
            </>
          )}
        </div>
      </section>

      {templates ? <PrototypeInspectorTemplatesSection {...templates} /> : null}

      {/* Staff only, and only ever present when the *server* said so — see the
          section's own docblock. Absent for every general user. */}
      {teachingPlan ? <PrototypeInspectorTeachingPlanSection {...teachingPlan} /> : null}

      {/* The other direction: not "when is this taught" but "what is this for".
          Only ever present on a note published in a ministry channel. */}
      {publishedFor ? <PrototypeInspectorPublishedForSection {...publishedFor} /> : null}

      {showActivityPanel && !isDraftCompose ? (
        <SharedNoteActivityPanel
          noteId={note.id}
          contextSpaceId={contextSpaceId}
          noteAuthorUserId={noteAuthorUserId}
          noteAuthorDisplayName={noteAuthorDisplayName}
          onSelectActivity={onSelectActivity}
          activeActivityId={activeActivityId}
        />
      ) : null}

      {showSpacesSection ? (
        <section className="proto-inspector-section">
          {/* "Shared with", not "Spaces": a space is an audience this note is
              published to, not a folder it lives in. */}
          <PrototypeSectionHeader>Shared with</PrototypeSectionHeader>
          <ul className="proto-inspector-space-list">
            {coEditSpaces.map((space) => (
              <li key={space.spaceId} className="proto-inspector-space-list__entry">
                <div className="proto-inspector-space-list__item">
                  <Icon name="user-group" size={12} aria-hidden />
                  <span className="proto-inspector-space-list__title">
                    {space.spaceTitle.trim() || 'Shared space'}
                  </span>
                  <PrototypeNoteCoEditToggle
                    noteId={note.id}
                    spaceId={space.spaceId}
                    spaceTitle={space.spaceTitle}
                    coEditEnabled={spaceCoEditById[space.spaceId] ?? space.coEditEnabled}
                    contentEncrypted={note.contentEncrypted}
                    onChanged={(enabled) => onSpaceCoEditChanged(space.spaceId, enabled)}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {!isForeignNote && !isDraftCompose ? (
        <>
      <section className="proto-inspector-section">
        <PrototypeSectionHeader>Tags</PrototypeSectionHeader>
        {isGuest ? (
          <PrototypeInspectorGuestRow what="Tags" />
        ) : (
          <PrototypeFolderTagEditor
            note={note}
            contextSpaceId={contextSpaceId}
            tagsOnly
          />
        )}
      </section>

      {/*
        Thread — the notes this one is connected to, and the way to connect
        another.

        Connecting used to open a floating sheet over the note you were
        connecting *from*, which is the one thing you need to see while
        deciding what relates to it. It is inline now: the search opens in
        place, the pool excludes what is already attached, and picking one
        connects it without the surface ever leaving.
      */}
      <section className="proto-inspector-section">
        <div className="proto-inspector-section__head">
          <PrototypeSectionHeader style={{ marginBottom: 0 }}>Thread</PrototypeSectionHeader>
          {spaceId ? (
            <button
              type="button"
              className="proto-inspector-connect-btn"
              title={connectOpen ? 'Done connecting' : 'Connect another note'}
              aria-label={connectOpen ? 'Done connecting' : 'Connect another note'}
              aria-expanded={connectOpen}
              onClick={() => setConnectOpen((open) => !open)}
            >
              <Icon name={connectOpen ? 'xmark' : 'plus'} size={12} aria-hidden />
              {connectOpen ? 'Done' : 'Connect'}
            </button>
          ) : null}
        </div>

        {spaceId && connectOpen ? (
          <div className="proto-inspector-connect">
            <ProtoNoteSearch
              homeSpaceId={spaceId}
              disabled={connectNote.isPending}
              /* Never offer what is already on the Thread, in either
                 direction — picking it would be a no-op the reader has to
                 discover by trying. */
              excludeNoteIds={[note.id, ...connectedNoteIds]}
              placeholder="Search notes to connect"
              onPick={(picked) => {
                connectNote.mutate({
                  parentNoteId: note.id,
                  linkedNoteId: picked.id,
                  spaceId,
                });
              }}
            />
          </div>
        ) : null}

        {hasConnections ? (
          <>
            <div className="proto-inspector-connections">
              {linkedFromNotes.length > 0 && (
                <div>
                  <p className="proto-inspector-connections-sublabel">Linked from</p>
                  <div className="proto-inspector-connections__group">
                    {linkedFromNotes.map((n) => (
                      <ConnectedNoteRow
                        key={n.id}
                        note={n}
                        direction="from"
                        currentNoteId={note.id}
                        contextSpaceId={contextSpaceId}
                      />
                    ))}
                  </div>
                </div>
              )}
              {linkedToNotes.length > 0 && (
                <div>
                  <p className="proto-inspector-connections-sublabel">Links to</p>
                  <div className="proto-inspector-connections__group">
                    {linkedToNotes.map((n) => (
                      <ConnectedNoteRow
                        key={n.id}
                        note={n}
                        direction="to"
                        currentNoteId={note.id}
                        contextSpaceId={contextSpaceId}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
            <button
              type="button"
              className="proto-inspector-view-thread"
              onClick={() => openStudyThreadPopover()}
            >
              <Icon name="arrow-right-arrow-left" size={11} aria-hidden />
              <span>Open Thread</span>
            </button>
          </>
        ) : connectOpen ? null : (
          <p className="proto-inspector-muted">Add a related note to start a Thread.</p>
        )}
      </section>

      <section className="proto-inspector-section">
        <PrototypeSectionHeader>Folders</PrototypeSectionHeader>
        {isGuest ? (
          <PrototypeInspectorGuestRow what="Folders" />
        ) : (
          <PrototypeFolderTagEditor
            note={note}
            contextSpaceId={contextSpaceId}
            folderOnly
          />
        )}
      </section>


        </>
      ) : null}

      {destructiveAction && !isDraftCompose ? (
        <div className="proto-inspector-delete">
          <button
            type="button"
            className="proto-inspector-delete-btn"
            disabled={actionPending}
            onClick={(e) => {
              deleteAnchorRef.current = e.currentTarget;
              setDeleteConfirmOpen(true);
            }}
          >
            <Icon name={destructiveAction === 'remove-from-space' ? 'minus' : 'trash-can'} size={12} aria-hidden />
            {destructiveAction === 'remove-from-space' ? 'Remove from this space' : 'Delete note'}
          </button>
        </div>
      ) : null}

      {deleteConfirmOpen ? (
        <ProtoConfirmDialog
          anchorEl={deleteAnchorRef.current}
          preferAbove
          title={
            destructiveAction === 'remove-from-space'
              ? REMOVE_NOTE_FROM_SPACE_CONFIRMATION.title
              : DELETE_CANONICAL_NOTE_CONFIRMATION.title
          }
          description={
            destructiveAction === 'remove-from-space'
              ? REMOVE_NOTE_FROM_SPACE_CONFIRMATION.description
              : DELETE_CANONICAL_NOTE_CONFIRMATION.description
          }
          confirmLabel={destructiveAction === 'remove-from-space' ? 'Remove' : 'Delete everywhere'}
          busy={actionPending}
          onConfirm={onActionConfirm}
          onCancel={() => {
            if (!actionPending) {
              setDeleteConfirmOpen(false);
              deleteAnchorRef.current = null;
            }
          }}
        />
      ) : null}
    </div>
  );
}

function ConnectedNoteRow({
  note,
  direction,
  currentNoteId,
  contextSpaceId,
}: {
  note: LinkedNoteRef;
  direction: 'from' | 'to';
  currentNoteId: string;
  contextSpaceId?: string | null;
}) {
  const disconnectNote = useDisconnectNote();
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const rawTitle =
    note.noteType === 'resource' && (note.resourceTitle ?? '').trim()
      ? (note.resourceTitle ?? '').trim()
      : stripServerAutoUntitledNoteTitleForDisplay((note.title ?? '').trim()) || 'New Note';

  // direction 'from' means this note is the source (fromNoteId), current is the target (toNoteId).
  // direction 'to' means current is the source (fromNoteId), this note is the target (toNoteId).
  const fromNoteId = direction === 'from' ? note.id : currentNoteId;
  const toNoteId = direction === 'from' ? currentNoteId : note.id;

  const handleDisconnect = (e: ReactMouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirmDisconnect) {
      setConfirmDisconnect(true);
      confirmTimerRef.current = setTimeout(() => setConfirmDisconnect(false), 2500);
      return;
    }
    if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    setConfirmDisconnect(false);
    disconnectNote.mutate({ fromNoteId, toNoteId });
  };

  return (
    <div className="proto-inspector-connected-note-row">
      <Link
        to={prototypeNoteRouteTo()}
        params={{ noteId: noteParamSlug(note.id) }}
        search={{
          ...PROTOTYPE_NOTE_LIST_NAV_SEARCH,
          space: toPrototypeSpaceSearchParam(contextSpaceId),
        }}
        className="proto-inspector-connected-note"
      >
        <Icon
          name={direction === 'from' ? 'arrow-left' : 'arrow-right'}
          size={10}
          className="proto-inspector-connected-note__arrow"
          aria-hidden
        />
        <span className="proto-inspector-connected-note__title">{rawTitle}</span>
      </Link>
      <button
        type="button"
        className={`proto-inspector-disconnect-btn${confirmDisconnect ? ' proto-inspector-disconnect-btn--confirm' : ''}`}
        title={confirmDisconnect ? 'Tap again to confirm' : 'Disconnect'}
        aria-label={confirmDisconnect ? `Confirm disconnect from ${rawTitle}` : `Disconnect from ${rawTitle}`}
        disabled={disconnectNote.isPending}
        onClick={handleDisconnect}
      >
        ×
      </button>
    </div>
  );
}

function InspectorRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="proto-inspector-row">
      <span className="proto-inspector-row-label">{label}</span>
      <span className="proto-inspector-row-value">{value}</span>
    </div>
  );
}

function InspectorAddedByValue({
  note,
  contextSpaceId,
}: {
  note: NoteDetail;
  contextSpaceId?: string | null;
}) {
  const { user } = useUser();
  const { userId: authUserId } = useAuth();
  const { data: profile } = useProfile();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const searchRaw = useRouterState({ select: (s) => s.location.searchStr });
  const { foreignNoteAuthor, readOnlyInSharedSpace } = useForeignSharedNote(note.id, contextSpaceId);

  if (normalizeNoteAddedBy(note.addedBy) === 'harvous') {
    return 'Harvous';
  }

  const isOwnNote =
    note.isOwnNote === true ||
    Boolean(authUserId && (note.authorUserId ?? note.userId) === authUserId);

  if (readOnlyInSharedSpace && foreignNoteAuthor && !isOwnNote) {
    return (
      <SharedSpaceNoteAuthorChip
        displayName={foreignNoteAuthor.displayName}
        userId={foreignNoteAuthor.userId}
        firstName={foreignNoteAuthor.firstName}
        profileImageUrl={foreignNoteAuthor.profileImageUrl}
        color={foreignNoteAuthor.userColor}
        isSelf={false}
      />
    );
  }

  const openAccountSettings = () => {
    storeSettingsOpenerPath(`${pathname}${searchRaw ?? ''}`);
    void navigate({ to: prototypeSettingsAccountRouteTo() });
  };

  return (
    <button
      type="button"
      className="proto-inspector-added-by-chip-btn"
      aria-label="Open account settings"
      title="Account settings"
      onClick={openAccountSettings}
    >
      <SharedSpaceNoteAuthorChip
        displayName={profile?.firstName ?? user?.firstName ?? 'You'}
        userId={authUserId ?? ''}
        firstName={user?.firstName ?? profile?.firstName}
        profileImageUrl={resolveClerkProfileImageUrl(user, profile?.profileImageUrl)}
        color={profile?.userColor}
        isSelf
      />
    </button>
  );
}

function formatSimpleNoteId(id: number): string {
  return `N${String(id).padStart(3, '0')}`;
}

/** Matches native `NoteInspectorView.infoSimpleNoteIdRow`: label ID, tap copies `N###`, brief “Copied”. */
function InspectorSimpleNoteIdRow({ simpleNoteId }: { simpleNoteId: number }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const display = formatSimpleNoteId(simpleNoteId);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(display);
      setCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setCopied(false);
        timerRef.current = null;
      }, 1500);
    } catch {
      /* clipboard unavailable */
    }
  }, [display]);

  return (
    <div className="proto-inspector-row">
      <span className="proto-inspector-row-label">ID</span>
      <span className="proto-inspector-row-value">
        <button
          type="button"
          className="proto-inspector-note-id-btn"
          onClick={onCopy}
          title="Copy note ID"
          aria-label={`Copy note ID ${display}`}
        >
          {copied ? 'Copied' : display}
        </button>
      </span>
    </div>
  );
}

function estimateWords(html: string): number {
  const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text) return 0;
  return text.split(' ').filter(Boolean).length;
}

function formatDate(d: Date): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
