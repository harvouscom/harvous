/**
 * Shared/public space view — sidebar 'space' layer dashboard (not the full notes list).
 */
import { useMemo, useState, useEffect } from 'react';
import Icon, { type IconName } from '@/components/react/Icon';
import { useAuth, useUser } from '@clerk/clerk-react';
import { useNavigate } from '@tanstack/react-router';
import { toast } from '@/utils/toast';
import { resolveProfileFirstName } from '@/utils/nav-avatar-initials';
import PrototypeSpaceComingUp from './PrototypeSpaceComingUp';
import { useChurchStaffStatus } from '../../hooks/queries/useChurchStaffStatus';
import { isQuerySettled } from '@/utils/prototype-home-ready';
import { useActiveSpace } from '../../hooks/useActiveSpace';
import { useSpace, useSpaceMembers, useSpaceNotes, type SpaceNoteRow } from '../../hooks/queries/useSpace';
import {
  selectCurrentSpaceThread,
  useSpaceGroupThreads,
  type SpaceGroupStudyThread,
} from '../../hooks/queries/useSpaceGroupThreads';
import { useSetCurrentSpaceThread } from '../../hooks/mutations/useSetCurrentSpaceThread';
import { usePrototypeSpaceScriptureIndex } from '../../hooks/queries/usePrototypeSpaceScriptureIndex';
import {
  getSharedSpaceUnseenSince,
  useSharedSpaceActivityPreview,
  useSharedSpaceLastVisit,
} from '../../hooks/useSharedSpaceVisit';
import { useProtoShell } from '../../layouts/proto-shell-context';
import type { SidebarListMode } from '../../layouts/proto-shell-context';
import { prototypeHomeRouteTo, prototypeNoteRouteTo } from '@/lib/prototype-path';
import { toPrototypeSpaceSearchParam } from '../../utils/prototype-space-api-id';
import { noteParamSlug } from './proto-route-slugs';
import { protoRelativeCaptionAbbrev } from './proto-time';
import { stripServerAutoUntitledNoteTitleForDisplay } from '@/utils/server-auto-untitled-note-display';
import { stripHtmlForListPreview } from '@/utils/html-stripper';
import SharedSpaceNoteAuthorChip from './SharedSpaceNoteAuthorChip';
import { PROTOTYPE_NOTE_LIST_NAV_SEARCH } from '@/utils/prototype-sidebar-highlight-active';
import PrototypeSpacePeopleSheet from './PrototypeSpacePeopleSheet';
import PrototypeListEmptyState from './PrototypeListEmptyState';
import ProtoSpaceMenuIcon from './ProtoSpaceMenuIcon';
import ProtoSpaceLoading from './ProtoSpaceLoading';
import PrototypeSidebarToolbar from './PrototypeSidebarToolbar';
import PrototypeHomeCardCarousel from './PrototypeHomeCardCarousel';
import PrototypeCardStack, { type CardStackRenderMode } from './PrototypeCardStack';
import { useProtoHomeViewClassName } from './useProtoHomeViewEnter';
import {
  buildSharedSpaceNoteCardSlots,
  buildSharedSpaceSocialIntro,
  groupSharedSpaceNoteCardSlots,
  selectTopSharedPassage,
  sharedSpacePeopleHeaderLabel,
  sharedThreadNoteCountPreview,
  formatSharedSpaceActivityWho,
  type SharedSpaceNoteCardSlot,
} from './shared-space-dashboard';
import SharedSpaceSocialGreeting from './SharedSpaceSocialGreeting';
import SharedSpaceAboutSheet from './SharedSpaceAboutSheet';
import {
  readSharedSpaceDashboardFixtureMode,
  sharedSpaceDashboardFixtureForMode,
} from '../dev/shared-spaces-design/shared-space-dashboard-fixture-mode';
import SharedSpaceDashboardFixtureView from '../dev/shared-spaces-design/SharedSpaceDashboardFixtureView';
import PrototypeCreateSharedThreadSheet from './PrototypeCreateSharedThreadSheet';
import PrototypeChangeSharedThreadSheet from './PrototypeChangeSharedThreadSheet';
import PrototypeSharedThreadDrilldown, {
  type SharedThreadDrillTarget,
} from './PrototypeSharedThreadDrilldown';
import { beginComposeInGroupThread } from '../../lib/compose-group-thread';
import {
  canComposeInSpace,
  canManageStudyThreadsInSharedSpace,
  canModerateMinistryChannel,
  isMinistryBroadcastSpace,
} from '../../lib/shared-space-capabilities';
import '../../styles/prototype-shared-threads.css';

const PREVIEW_MAX = 90;
const RECENT_PREVIEW_LIMIT = 3;

export function sharedThreadDashboardModel(
  threads: SpaceGroupStudyThread[],
  isOwner: boolean,
  options?: { canStartThread?: boolean },
) {
  const currentThread = selectCurrentSpaceThread(threads);
  const canStart = options?.canStartThread ?? isOwner;
  return {
    currentThread,
    otherThreads: threads.filter((thread) => thread.id !== currentThread?.id),
    canStartThread: canStart && currentThread === null,
    // Members can't start a Thread — an empty Current Thread block is pure noise
    // for them, so hide the whole section rather than explain the absence.
    showCurrentThreadBlock: currentThread !== null || canStart,
    emptyLabel:
      currentThread === null
        ? canStart
          ? 'No thread yet.'
          : isOwner
            ? 'Browse notes and About — composing opens later.'
            : 'Waiting for the owner to start one.'
        : null,
  };
}

export function sharedSpaceDashboardHasError(input: {
  space: boolean;
  members: boolean;
  activity: boolean;
  notes: boolean;
  currentThread: boolean;
  scriptureIndex: boolean;
}): boolean {
  return Object.values(input).some(Boolean);
}

function noteRowTitle(note: SpaceNoteRow): string {
  const stripped = stripServerAutoUntitledNoteTitleForDisplay(note.title ?? null);
  if (stripped) return stripped;
  const preview = stripHtmlForListPreview(note.content ?? '', 48);
  if (preview) return preview;
  return `Note N${note.simpleNoteId?.toString().padStart(3, '0') ?? ''}`;
}

function noteRowPreview(note: SpaceNoteRow): string {
  const titleUsesPreview =
    !stripServerAutoUntitledNoteTitleForDisplay(note.title ?? null) &&
    stripHtmlForListPreview(note.content ?? '', 48) === noteRowTitle(note);
  if (titleUsesPreview) return '';
  const raw = note.content ?? '';
  if (!raw.trim()) return '';
  return stripHtmlForListPreview(raw, PREVIEW_MAX);
}

function noteKindIcon(noteType: string | undefined): IconName {
  if (noteType === 'scripture') return 'book';
  if (noteType === 'resource') return 'link';
  return 'note-sticky';
}

function SharedSpaceNoteCard({
  cardSlot,
  authorName,
  authorUserId,
  authorFirstName,
  authorProfileImageUrl,
  authorColor,
  isOwn,
  onOpen,
  showEyebrow = true,
  mode = 'interactive',
}: {
  cardSlot: SharedSpaceNoteCardSlot;
  authorName: string;
  authorUserId: string;
  authorFirstName?: string | null;
  authorProfileImageUrl?: string | null;
  authorColor: string;
  isOwn: boolean;
  onOpen: () => void;
  showEyebrow?: boolean;
  /** `preview` renders inert markup for the collapsed card stack, which wraps
   *  it in its own button — a button inside a button is invalid markup. */
  mode?: CardStackRenderMode;
}) {
  const { note, eyebrow } = cardSlot;
  const preview = noteRowPreview(note);
  const rel = protoRelativeCaptionAbbrev(note.lastUpdated ?? note.updatedAt ?? note.createdAt ?? null);
  const Root = mode === 'preview' ? 'div' : 'button';

  return (
    <Root
      {...(mode === 'preview' ? {} : { type: 'button' as const, onClick: onOpen })}
      className={`proto-glass-surface proto-glass-surface--panel proto-home-card${
        mode === 'preview' ? '' : ' proto-home-card--tappable'
      }`}
    >
      {showEyebrow ? <p className="proto-caption proto-home-card__eyebrow">{eyebrow}</p> : null}
      <div className="proto-home-card__body">
        <div className="proto-home-card__title-row">
          <span className="proto-home-card__icon-orb" aria-hidden>
            <Icon name={noteKindIcon(note.noteType)} size={13} />
          </span>
          <p className="pds-list-title proto-home-card__title">{noteRowTitle(note)}</p>
          <span className="proto-home-card__chevron" aria-hidden>
            <Icon name="caret-right" size={11} />
          </span>
        </div>
        {preview ? (
          <p className="pds-list-preview proto-home-card__preview">{preview}</p>
        ) : null}
        <div className="proto-home-card__meta">
          <SharedSpaceNoteAuthorChip
            displayName={authorName}
            userId={authorUserId}
            firstName={authorFirstName}
            profileImageUrl={authorProfileImageUrl}
            color={authorColor}
            isSelf={isOwn}
          />
          {rel ? (
            <>
              <span className="proto-home-card__meta-sep" aria-hidden>
                ·
              </span>
              <span className="proto-home-card__meta-item">{rel}</span>
            </>
          ) : null}
        </div>
      </div>
    </Root>
  );
}

export default function PrototypeSidebarSharedSpaceView() {
  const fixtureMode = readSharedSpaceDashboardFixtureMode();
  if (fixtureMode) {
    return <SharedSpaceDashboardFixtureView fixture={sharedSpaceDashboardFixtureForMode(fixtureMode)} />;
  }
  return <PrototypeSidebarSharedSpaceViewLive />;
}

function PrototypeSidebarSharedSpaceViewLive() {
  const navigate = useNavigate();
  const { userId: authUserId } = useAuth();
  const { user } = useUser();
  const {
    activeSpaceId,
    isOwner,
    spaceTitle: resolvedSpaceTitle,
    space: navSpace,
  } = useActiveSpace();
  const {
    isMobileSidebar,
    setSidebarLayer,
    setSidebarListMode,
    setScriptureDrill,
    ensureSidebarExpanded,
    closeDrawer,
    beginPrototypeComposeSession,
  } = useProtoShell();
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [createThreadOpen, setCreateThreadOpen] = useState(false);
  const [changeThreadOpen, setChangeThreadOpen] = useState(false);
  const [threadTab, setThreadTab] = useState<'current' | 'available'>('current');
  const [drilledThread, setDrilledThread] = useState<SharedThreadDrillTarget | null>(null);
  const [threadPinError, setThreadPinError] = useState<string | null>(null);

  const spaceQuery = useSpace(activeSpaceId ?? '');
  const membersQuery = useSpaceMembers(activeSpaceId ?? '');
  const activityQuery = useSharedSpaceActivityPreview(activeSpaceId);
  const notesQuery = useSpaceNotes(activeSpaceId ?? '', 20);
  const groupThreadsQuery = useSpaceGroupThreads(activeSpaceId ?? undefined);
  const scriptureQuery = usePrototypeSpaceScriptureIndex(activeSpaceId ?? undefined);
  const setCurrentThread = useSetCurrentSpaceThread();
  const { data: lastVisit } = useSharedSpaceLastVisit(activeSpaceId);
  const visitNewCount = lastVisit?.newNoteCount ?? 0;

  const space = spaceQuery.data;
  const members = membersQuery.data?.members ?? [];
  // No `|| 1` fallback: that flashed "Just you" on a populated space while
  // membersQuery was still in flight. membersSettled below gates the render
  // instead, so peopleCount only needs a safe default for the settled case.
  const peopleCount = membersQuery.data?.memberCount ?? members.length;
  const membersSettled = isQuerySettled(membersQuery.isPending, membersQuery.data != null);
  const spaceTitle = resolvedSpaceTitle ?? space?.title ?? 'Shared space';
  const ministryMeta = {
    type: navSpace?.type ?? space?.type,
    orgId: navSpace?.orgId ?? null,
  };
  const isMinistryChannel = isMinistryBroadcastSpace(ministryMeta);
  /*
    Server's `manage_staff` verdict for this room's church — never re-derived
    from a role string. Handing someone the right to publish into a room the
    congregation follows sits with the people who manage the roster, so the
    same capability gates both. The space owner is the other way in, and the
    server allows that arm on its own.
  */
  const { can: canChurchForSpace } = useChurchStaffStatus(ministryMeta.orgId ?? null);
  const canComposeHere = canComposeInSpace(ministryMeta);
  const churchEyebrow = navSpace?.churchName?.trim() || null;

  const selfDisplayName = resolveProfileFirstName(user, null) || 'You';
  const isSpaceOwner =
    membersQuery.data?.isOwner ??
    (members.some((m) => m.userId === authUserId && m.role === 'owner') ||
      Boolean(space?.isOwner) ||
      isOwner);
  const membershipRole =
    navSpace?.role ??
    members.find((m) => m.userId === authUserId)?.role ??
    (isSpaceOwner ? 'owner' : 'member');
  const canManageThreads = canManageStudyThreadsInSharedSpace({
    isOwner: isSpaceOwner,
    membershipRole,
    type: ministryMeta.type,
    orgId: ministryMeta.orgId,
  });
  const canModerateChannel = canModerateMinistryChannel({
    isOwner: isSpaceOwner,
    membershipRole,
    type: ministryMeta.type,
    orgId: ministryMeta.orgId,
  });

  const openPeopleSheet = () => {
    if (isMinistryChannel && !canModerateChannel) return;
    setAboutOpen(false);
    setPeopleOpen(true);
  };
  const recentNotes = activityQuery.data?.recentNotes ?? [];
  const totalNoteCount = activityQuery.data?.totalNoteCount ?? recentNotes.length;
  const bannerNewCount = visitNewCount || activityQuery.data?.newNoteCount || 0;
  const activityWhoLine = formatSharedSpaceActivityWho(activityQuery.data?.newContributors);
  const unseenSince = activeSpaceId ? getSharedSpaceUnseenSince(activeSpaceId) : null;

  const notesForContinue = useMemo(
    () => notesQuery.data?.pages.flatMap((page) => page.notes) ?? recentNotes,
    [notesQuery.data?.pages, recentNotes],
  );

  const noteCardSlots = useMemo(
    () =>
      buildSharedSpaceNoteCardSlots({
        recentNotes,
        notesForContinue,
        unseenSince,
        authUserId,
      }),
    [recentNotes, notesForContinue, unseenSince, authUserId],
  );

  const noteCardGroups = useMemo(() => groupSharedSpaceNoteCardSlots(noteCardSlots), [noteCardSlots]);

  const contributorIntro = useMemo(
    () =>
      buildSharedSpaceSocialIntro({
        sampleNotes: notesForContinue,
        authUserId,
        totalNoteCount,
        hasMoreNotes: totalNoteCount > RECENT_PREVIEW_LIMIT,
      }),
    [notesForContinue, authUserId, totalNoteCount],
  );

  const groupThreads = groupThreadsQuery.data ?? [];
  const threadDashboard = useMemo(
    () =>
      sharedThreadDashboardModel(groupThreads, isSpaceOwner, {
        canStartThread: canManageThreads,
      }),
    [groupThreads, isSpaceOwner, canManageThreads],
  );

  const topPassage = useMemo(
    () => selectTopSharedPassage(scriptureQuery.data ?? []),
    [scriptureQuery.data],
  );

  const groupThreadsSettled = isQuerySettled(groupThreadsQuery.isPending, groupThreadsQuery.data != null);
  const scriptureSettled = isQuerySettled(scriptureQuery.isPending, scriptureQuery.data != null);
  const notesSettled = isQuerySettled(notesQuery.isPending, notesQuery.data != null);

  // Must stay above every early return below — skipping this hook when
  // `!activeSpaceId` / dashboard error / still loading flips the hook count and
  // React throws "Rendered fewer hooks than expected".
  const contentReady =
    Boolean(activeSpaceId) &&
    !spaceQuery.isPending &&
    !activityQuery.isLoading &&
    notesSettled &&
    groupThreadsSettled &&
    scriptureSettled;
  const homeViewClassName = useProtoHomeViewClassName(contentReady, activeSpaceId);

  const goToListMode = (mode: SidebarListMode) => {
    ensureSidebarExpanded();
    setSidebarLayer('list');
    setSidebarListMode(mode);
  };

  const goToNotesList = () => goToListMode('notes');

  const openNote = (note: SpaceNoteRow) => {
    navigate({
      to: prototypeNoteRouteTo(),
      params: { noteId: noteParamSlug(note.id) },
      search: {
        ...PROTOTYPE_NOTE_LIST_NAV_SEARCH,
        space: toPrototypeSpaceSearchParam(activeSpaceId),
      },
    });
  };

  const openThread = (thread: SpaceGroupStudyThread) => {
    setDrilledThread(thread);
    ensureSidebarExpanded();
  };

  const composeInSharedSpace = (threadId?: string) => {
    if (!activeSpaceId) return;
    if (isMobileSidebar) closeDrawer({ preserveHistory: true });
    if (threadId) {
      beginComposeInGroupThread(activeSpaceId, threadId, beginPrototypeComposeSession);
    } else {
      beginPrototypeComposeSession({ targetSpaceId: activeSpaceId });
    }
    navigate({ to: prototypeHomeRouteTo() });
  };

  const makeThreadCurrent = async (threadId: string) => {
    if (!activeSpaceId) throw new Error('Shared space is unavailable');
    setThreadPinError(null);
    await setCurrentThread.mutateAsync({ spaceId: activeSpaceId, threadId });
    setDrilledThread((current) => (current?.id === threadId ? { ...current, isPinned: true } : current));
  };

  const openPassage = () => {
    if (!topPassage) return;
    setScriptureDrill({ level: 'notes', bookOrder: topPassage.bookOrder, passageKey: topPassage.passageKey });
    setSidebarListMode('scripture');
    setSidebarLayer('list');
    ensureSidebarExpanded();
  };

  const resolveAuthor = (note: SpaceNoteRow) => {
    const isOwn = note.isOwnNote ?? (note.authorUserId != null && note.authorUserId === authUserId);
    const member = members.find(
      (m) => m.userId === (note.authorUserId ?? (isOwn ? authUserId : undefined)),
    );
    const authorName = isOwn ? 'You' : (note.authorDisplayName ?? member?.displayName ?? 'Member');
    const authorColor = isOwn
      ? (member?.userColor ?? 'blue')
      : (note.authorColor ?? member?.userColor ?? 'blue');
    return {
      isOwn,
      authorName,
      authorUserId: note.authorUserId ?? member?.userId ?? authUserId ?? '',
      authorFirstName: member?.firstName,
      authorProfileImageUrl: member?.profileImageUrl,
      authorColor,
    };
  };

  /**
   * Current first, then the rest. Gated exactly as the old "Threads" section
   * was: only managers ever saw the other Threads, and merging the sections
   * must not quietly widen that to every member.
   */
  /**
   * Only managers ever saw the space's other Threads, and merging the old
   * "Threads" section into this one must not quietly widen that.
   */
  const availableThreads = canManageThreads ? threadDashboard.otherThreads : [];

  /**
   * Tabs only earn their place once there is a second view behind them, and
   * "Available" is manager-only — so a member, or an owner whose space has one
   * Thread, still sees the plain "Current Thread" heading.
   */
  const showThreadTabs = availableThreads.length > 0;
  /** The Current tab holds exactly the current Thread: it is what the tab claims. */
  const threadStackItems = useMemo(
    () => (threadDashboard.currentThread ? [threadDashboard.currentThread] : []),
    [threadDashboard.currentThread],
  );

  /**
   * One Thread as a card. The space's other Threads used to live in a separate
   * "Threads" list below, in a different (compact row) anatomy — so switching
   * meant reading two sections that were really one list with one item promoted.
   * They're peers in a single deck now, current on top.
   *
   * `preview` is inert because the collapsed stack wraps it in its own button.
   * Interactive, the current Thread is a whole-card button (it is the section's
   * primary target); the others are a div carrying two sibling buttons — open
   * and "Set current" — since a button cannot contain a button.
   */
  const renderThreadCard = (
    thread: SpaceGroupStudyThread,
    _index: number,
    mode: CardStackRenderMode = 'interactive',
  ) => {
    const isCurrent = thread.id === threadDashboard.currentThread?.id;
    const stacked = threadStackItems.length > 1;
    const body = (
      <div className="proto-home-card__body">
        <div className="proto-home-card__title-row">
          <span className="proto-home-card__icon-orb" aria-hidden>
            <Icon name="arrow-right-arrow-left" size={13} />
          </span>
          {mode === 'preview' || isCurrent ? (
            <p className="pds-list-title proto-home-card__title">{thread.title}</p>
          ) : (
            <button
              type="button"
              className="proto-shared-thread-card__open pds-list-title proto-home-card__title"
              onClick={() => openThread(thread)}
            >
              {thread.title}
            </button>
          )}
          {mode === 'preview' || isCurrent ? (
            <span className="proto-home-card__chevron" aria-hidden>
              <Icon name="caret-right" size={11} />
            </span>
          ) : (
            <button
              type="button"
              className="proto-shared-thread-action"
              disabled={setCurrentThread.isPending}
              onClick={() => {
                void makeThreadCurrent(thread.id).catch((error) => {
                  setThreadPinError(
                    error instanceof Error ? error.message : 'Could not set this Thread as current.',
                  );
                });
              }}
            >
              Set current
            </button>
          )}
        </div>
        <p className="pds-list-preview proto-home-card__preview">
          {/* Only worth saying which one is current once there is more than one. */}
          {isCurrent && stacked ? 'Current · ' : ''}
          {sharedThreadNoteCountPreview(thread.noteCount)}
        </p>
      </div>
    );

    if (mode === 'preview' || !isCurrent) {
      return (
        <div className="proto-glass-surface proto-glass-surface--panel proto-home-card">{body}</div>
      );
    }
    return (
      <button
        type="button"
        className="proto-glass-surface proto-glass-surface--panel proto-home-card proto-home-card--tappable"
        onClick={() => openThread(thread)}
      >
        {body}
      </button>
    );
  };

  const renderNotePreviewCard = (
    slot: SharedSpaceNoteCardSlot,
    showEyebrow = true,
    mode: CardStackRenderMode = 'interactive',
  ) => {
    const author = resolveAuthor(slot.note);
    return (
      <SharedSpaceNoteCard
        mode={mode}
        cardSlot={slot}
        authorName={author.authorName}
        authorUserId={author.authorUserId}
        authorFirstName={author.authorFirstName}
        authorProfileImageUrl={author.authorProfileImageUrl}
        authorColor={author.authorColor}
        isOwn={author.isOwn}
        showEyebrow={showEyebrow}
        onOpen={() => openNote(slot.note)}
      />
    );
  };

  useEffect(() => {
    if (!activeSpaceId || !spaceTitle) return;
    try {
      const raw = sessionStorage.getItem('harvous_just_joined_space');
      if (!raw) return;
      const parsed = JSON.parse(raw) as { id?: string; title?: string };
      const normalized = parsed.id?.startsWith('space_') ? parsed.id : parsed.id ? `space_${parsed.id}` : null;
      if (normalized !== activeSpaceId) return;
      sessionStorage.removeItem('harvous_just_joined_space');
      toast.success(`You're in ${parsed.title || spaceTitle}`);
    } catch {
      sessionStorage.removeItem('harvous_just_joined_space');
    }
  }, [activeSpaceId, spaceTitle]);

  if (!activeSpaceId) return null;

  const dashboardHasError = sharedSpaceDashboardHasError({
    space: spaceQuery.isError,
    members: membersQuery.isError,
    activity: activityQuery.isError,
    notes: notesQuery.isError,
    currentThread: groupThreadsQuery.isError,
    scriptureIndex: scriptureQuery.isError,
  });

  const retryDashboard = () => {
    void Promise.all([
      spaceQuery.refetch(),
      membersQuery.refetch(),
      activityQuery.refetch(),
      notesQuery.refetch(),
      groupThreadsQuery.refetch(),
      scriptureQuery.refetch(),
    ]);
  };

  if (dashboardHasError) {
    return (
      <div className="proto-sidebar-root proto-shared-space-dashboard">
        {isMobileSidebar ? <PrototypeSidebarToolbar variant="drawer" /> : null}
        <div className="proto-shared-thread-state" role="alert">
          <p>Could not load this shared space.</p>
          <button type="button" className="proto-shared-thread-action" onClick={retryDashboard}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!contentReady) {
    return (
      <div className="proto-sidebar-root proto-shared-space-dashboard">
        {isMobileSidebar ? <PrototypeSidebarToolbar variant="drawer" /> : null}
        <ProtoSpaceLoading label="Loading space" />
      </div>
    );
  }

  if (drilledThread) {
    return (
      <PrototypeSharedThreadDrilldown
        thread={drilledThread}
        spaceId={activeSpaceId}
        isOwner={canManageThreads}
        canCompose={canComposeHere}
        backLabel={spaceTitle}
        onBack={() => setDrilledThread(null)}
        onCompose={() => composeInSharedSpace(drilledThread.id)}
        onSetCurrent={makeThreadCurrent}
        onThreadUpdated={(patch) => {
          setDrilledThread((current) => (current ? { ...current, ...patch } : current));
        }}
      />
    );
  }

  return (
    <div className="proto-sidebar-root proto-shared-space-dashboard">
      {isMobileSidebar ? <PrototypeSidebarToolbar variant="drawer" /> : null}
      <div className="proto-shared-space-header">
        <div className="proto-shared-space-header__row">
          <ProtoSpaceMenuIcon
            color={space?.color || 'paper'}
            size={30}
            radius={9}
            iconName={isMinistryChannel ? 'rss' : 'user-group'}
          />
          <div className="proto-shared-space-header__meta">
            {isMinistryChannel && churchEyebrow ? (
              <p
                className="proto-caption proto-shared-space-header__church proto-marquee"
                title={churchEyebrow}
              >
                <span>{churchEyebrow}</span>
              </p>
            ) : null}
            <div
              className="pds-list-title proto-shared-space-header__title proto-marquee"
              title={spaceTitle}
            >
              <span>{spaceTitle}</span>
            </div>
            {!isMinistryChannel ? (
              <button
                type="button"
                className="proto-shared-space-header__people"
                onClick={openPeopleSheet}
              >
                <span>{membersSettled ? sharedSpacePeopleHeaderLabel(peopleCount) : ' '}</span>
                {isSpaceOwner ? (
                  <>
                    <span className="proto-shared-space-header__dot" aria-hidden>
                      ·
                    </span>
                    <span className="proto-shared-space-header__invite">Invite</span>
                  </>
                ) : null}
              </button>
            ) : null}
          </div>
          <div className="proto-shared-space-header__actions">
            <button
              type="button"
              className="proto-toolbar-icon-btn"
              aria-label="About this space"
              title="About this space"
              onClick={() => setAboutOpen(true)}
            >
              <Icon name="circle-info" size={15} />
            </button>
            {(isSpaceOwner && !isMinistryChannel) || canModerateChannel ? (
              <button
                type="button"
                className="proto-toolbar-icon-btn"
                title={isMinistryChannel ? 'Channel settings' : 'Space settings'}
                aria-label={isMinistryChannel ? 'Channel settings' : 'Space settings'}
                onClick={openPeopleSheet}
              >
                <Icon name="gear" size={15} />
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="proto-sidebar-scroll">
        <div className={homeViewClassName}>
          {/*
            What this room is studying next. Staff-gated server-side, so it is
            only requested for someone who can already see the church's plans;
            everyone else, and every space without a plan, renders nothing.
          */}
          <PrototypeSpaceComingUp
            spaceId={activeSpaceId ?? null}
            enabled={Boolean(ministryMeta.orgId) && canManageThreads}
          />
          {bannerNewCount > 0 ? (
            <div className="proto-home-section">
              <p className="proto-home-greeting">
                {bannerNewCount === 1 ? (
                  <>
                    Since you were last here, there&apos;s{' '}
                    <button
                      type="button"
                      className="proto-glass-surface proto-home-greeting__chip proto-home-greeting__chip--count"
                      aria-label="View new notes"
                      onClick={goToNotesList}
                    >
                      <span>1 new note</span>
                    </button>{' '}
                    to catch up on.
                    {activityWhoLine ? <> {activityWhoLine}.</> : null}
                  </>
                ) : (
                  <>
                    Since you were last here, there are{' '}
                    <button
                      type="button"
                      className="proto-glass-surface proto-home-greeting__chip proto-home-greeting__chip--count"
                      aria-label="View new notes"
                      onClick={goToNotesList}
                    >
                      <span>{bannerNewCount} new notes</span>
                    </button>{' '}
                    to catch up on.
                    {activityWhoLine ? <> {activityWhoLine}.</> : null}
                  </>
                )}
              </p>
            </div>
          ) : null}

          {contributorIntro && !bannerNewCount ? (
            <div className="proto-home-section">
              <SharedSpaceSocialGreeting
                selfFirstName={selfDisplayName}
                intro={contributorIntro}
                presenceOthers={[]}
                onOpenNotes={goToNotesList}
                onOpenPeople={isMinistryChannel && !canModerateChannel ? undefined : openPeopleSheet}
              />
            </div>
          ) : null}

          {!isMinistryChannel && threadDashboard.showCurrentThreadBlock ? (
            <div className="proto-home-section">
              {/*
                Current and Available are two views of one list, so they share a
                row rather than stacking as two headed sections — which made an
                unpinned Thread under a "Current Thread" heading look current.
                No tabs when there is nothing to switch to: one tab is chrome.
              */}
              <div className="proto-shared-thread-current-header">
                {/* No eyebrow when the tabs are up: "Current Thread" carries the
                    noun itself, which leaves "Available" unambiguous and saves a
                    heading that only repeated the tab beneath it. */}
                {showThreadTabs ? null : (
                  <p className="proto-caption proto-home-section__eyebrow">Current Thread</p>
                )}
                {canManageThreads && threadDashboard.currentThread && !showThreadTabs ? (
                  <button
                    type="button"
                    className="proto-shared-thread-action"
                    onClick={() => setChangeThreadOpen(true)}
                  >
                    Change
                  </button>
                ) : null}
              </div>
              {showThreadTabs ? (
                <div
                  className="proto-chip-bar proto-shared-thread-tabs"
                  role="tablist"
                  aria-label="Threads in this space"
                >
                  {(['current', 'available'] as const).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      role="tab"
                      aria-selected={threadTab === tab}
                      className={`proto-chip${threadTab === tab ? ' proto-chip--selected' : ''}`}
                      onClick={() => setThreadTab(tab)}
                    >
                      {tab === 'current' ? 'Current Thread' : 'Available'}
                    </button>
                  ))}
                </div>
              ) : null}
              {showThreadTabs && threadTab === 'available' ? (
                <>
                  <PrototypeCardStack
                    items={availableThreads}
                    ariaLabel="Available Threads"
                    collapsedLabel="Show all Threads"
                    renderItem={renderThreadCard}
                  />
                  {threadPinError ? (
                    <p className="proto-connect-note-sheet__error" role="alert">
                      {threadPinError}
                    </p>
                  ) : null}
                </>
              ) : threadStackItems.length > 0 ? (
                <>
                  {/* One item renders as a plain card, so a space with a single
                      Thread keeps one-tap-to-open. */}
                  <PrototypeCardStack
                    items={threadStackItems}
                    ariaLabel="Threads in this space"
                    collapsedLabel="Show all Threads"
                    renderItem={renderThreadCard}
                  />
                  {threadPinError ? (
                    <p className="proto-connect-note-sheet__error" role="alert">
                      {threadPinError}
                    </p>
                  ) : null}
                </>
              ) : (
                <div className="proto-list-create-empty">
                  <PrototypeListEmptyState iconName="arrow-right-arrow-left" title={threadDashboard.emptyLabel ?? ''} />
                  {threadDashboard.canStartThread ? (
                    <button
                      type="button"
                      className="proto-shared-thread-action proto-shared-thread-action--primary"
                      onClick={() => setCreateThreadOpen(true)}
                    >
                      Start a Thread
                    </button>
                  ) : null}
                </div>
              )}
            </div>
          ) : null}

          {totalNoteCount === 0 ? (
            <div className="proto-home-section">
              {canComposeHere ? (
                <button
                  type="button"
                  className="proto-glass-surface proto-glass-surface--panel proto-home-card proto-home-card--tappable"
                  onClick={() => composeInSharedSpace(threadDashboard.currentThread?.id)}
                >
                  <div className="proto-home-card__body">
                    <div className="proto-home-card__title-row">
                      <span className="proto-home-card__icon-orb" aria-hidden>
                        <Icon name="note-sticky" size={13} />
                      </span>
                      <p className="pds-list-title proto-home-card__title">No notes yet</p>
                      <span className="proto-home-card__chevron" aria-hidden>
                        <Icon name="caret-right" size={11} />
                      </span>
                    </div>
                    <p className="pds-list-preview proto-home-card__preview">
                      {`Create the first note in ${spaceTitle}...`}
                    </p>
                  </div>
                </button>
              ) : (
                <div className="proto-glass-surface proto-glass-surface--panel proto-home-card">
                  <div className="proto-home-card__body">
                    <div className="proto-home-card__title-row">
                      <span className="proto-home-card__icon-orb" aria-hidden>
                        <Icon name="note-sticky" size={13} />
                      </span>
                      <p className="pds-list-title proto-home-card__title">No notes yet</p>
                    </div>
                    <p className="pds-list-preview proto-home-card__preview">
                      Curriculum notes will show up here when they are published.
                    </p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              {topPassage ? (
                <div className="proto-home-section">
                  <button
                    type="button"
                    className="proto-glass-surface proto-glass-surface--panel proto-home-card proto-home-card--tappable"
                    onClick={openPassage}
                  >
                    <p className="proto-caption proto-home-card__eyebrow">Showing up in your notes</p>
                    <div className="proto-home-card__body">
                      <div className="proto-home-card__title-row">
                        <span className="proto-home-card__icon-orb" aria-hidden>
                          <Icon name="scroll" size={13} />
                        </span>
                        <p className="pds-list-title proto-home-card__title">{topPassage.displayRef}</p>
                        <span className="proto-home-card__chevron" aria-hidden>
                          <Icon name="caret-right" size={11} />
                        </span>
                      </div>
                      <div className="proto-home-card__meta">
                        <span className="proto-home-card__meta-item">
                          Across {topPassage.noteCount} {topPassage.noteCount === 1 ? 'note' : 'notes'} in this space
                        </span>
                      </div>
                    </div>
                  </button>
                </div>
              ) : null}

              {noteCardGroups.map((group) => (
                <div key={`${group.eyebrow}-${group.slots[0].note.id}`} className="proto-home-section">
                  {group.slots.length === 1 ? (
                    renderNotePreviewCard(group.slots[0])
                  ) : (
                    <>
                      <p className="proto-caption proto-home-section__eyebrow">{group.eyebrow}</p>
                      <PrototypeHomeCardCarousel
                        items={group.slots.map((slot) => ({ ...slot, id: slot.note.id }))}
                        ariaLabel={group.eyebrow}
                        renderItem={(slot, _idx, mode) => renderNotePreviewCard(slot, false, mode)}
                      />
                    </>
                  )}
                </div>
              ))}

            </>
          )}
        </div>
      </div>

      <SharedSpaceAboutSheet
        open={aboutOpen}
        onOpenChange={setAboutOpen}
        space={space ?? null}
        members={isMinistryChannel && !canModerateChannel ? [] : members}
        hideMemberRoster={isMinistryChannel && !canModerateChannel}
        ministryChannel={isMinistryChannel}
      />

      <PrototypeSpacePeopleSheet
        open={peopleOpen}
        onOpenChange={setPeopleOpen}
        spaceId={activeSpaceId}
        spaceTitle={spaceTitle}
        spaceColor={space?.color}
        spaceDescription={space?.description}
        spaceCoverBgLight={space?.coverBgLight}
        spacePublishCadence={space?.publishCadence}
        spaceCadenceStale={space?.cadenceStale}
        viewerIsOwner={isSpaceOwner}
        viewerCanModerate={canModerateChannel}
        ministryChannel={isMinistryChannel}
        canGrantLeadership={
          Boolean(ministryMeta.orgId) && (canChurchForSpace('manage_staff') || isSpaceOwner)
        }
      />
      <PrototypeCreateSharedThreadSheet
        open={createThreadOpen}
        onOpenChange={setCreateThreadOpen}
        spaceId={activeSpaceId}
        spaceColor={space?.color}
        isOwner={isSpaceOwner}
        onPinFailure={() => groupThreadsQuery.refetch()}
        onCreated={(thread) => {
          setDrilledThread({
            id: thread.id,
            title: thread.title,
            isPinned: true,
            color: thread.color ?? null,
          });
        }}
      />
      <PrototypeChangeSharedThreadSheet
        open={changeThreadOpen}
        onOpenChange={setChangeThreadOpen}
        spaceId={activeSpaceId}
        currentThreadId={threadDashboard.currentThread?.id ?? null}
        otherThreads={threadDashboard.otherThreads}
        isOwner={isSpaceOwner}
        onStartThread={() => setCreateThreadOpen(true)}
        onChanged={(threadId) => {
          setDrilledThread((current) =>
            current?.id === threadId ? { ...current, isPinned: true } : current,
          );
          setThreadPinError(null);
        }}
        onCleared={() => {
          // Mirrors onChanged: a Thread open in the drilldown must stop
          // claiming it is current the moment the space stops pinning it.
          setDrilledThread((current) =>
            current?.isPinned ? { ...current, isPinned: false } : current,
          );
          setThreadPinError(null);
        }}
      />
    </div>
  );
}
