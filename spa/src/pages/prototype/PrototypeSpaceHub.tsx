/**
 * A shared or ministry space's own surface — not the full notes list.
 *
 * Lives on the canvas. It wore either chrome for one phase so the move could be lived with
 * before the rail's copy was deleted, and that copy is gone now.
 *
 * The inner markup was never touched by the move. CSS maps `.proto-shared-space-header` onto the
 * sheet's head and `.proto-sidebar-scroll` onto its scrolling body, so a 1100-line view with
 * four exit points changed frame without changing a single one of them.
 */
import { useMemo, useRef, useState, useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
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
  sequenceStepLabel,
  useSpaceGroupThreads,
  type SpaceGroupStudyThread,
} from '../../hooks/queries/useSpaceGroupThreads';
import { useSetCurrentSpaceThread } from '../../hooks/mutations/useSetCurrentSpaceThread';
import { useSpaceCompanion } from '../../hooks/queries/useChannelLinks';
import { useSwitchToSpace } from '../../hooks/useSwitchToSpace';
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
import PublicJoinSpaceHero from '../public/PublicJoinSpaceHero';
import ProtoPopoverShell from './ProtoPopoverShell';
import { useProtoAnchoredPopoverPosition } from './useProtoAnchoredPopoverPosition';
import { useDismissOnOutside } from '../../hooks/usePopoverDismiss';
import { ProtoToolsRowList, type ProtoToolRow } from './proto-tools-registry';
import { companionToolRow } from '../../lib/space-companion';
import { spaceLibraryMeta, useSpaceLibrary } from '../../hooks/queries/useSpaceLibrary';
import { useChurchSpacePlan } from '../../hooks/queries/useChurchSpacePlan';
import { markPendingPlannerIntent } from '../../lib/pending-planner-intent';
import { localTodayIso } from '../../lib/church-services';
import { parseLocalDateInput } from '../../lib/proto-date-picker';
import PrototypeListEmptyState from './PrototypeListEmptyState';
import ProtoSpaceMenuIcon from './ProtoSpaceMenuIcon';
import ProtoSpaceLoading from './ProtoSpaceLoading';
import PrototypeHomeRow from './PrototypeHomeRow';
import HomeSection from './PrototypeHomeSection';
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
import { deletedNoteIds, subscribeDeletedNotes } from './proto-deleted-notes';
import SharedSpaceSocialGreeting from './SharedSpaceSocialGreeting';
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

/**
 * A note as a Home row.
 *
 * Was a card: eyebrow, title, preview and meta each on their own line — four lines per note
 * in a column that shows several. As a row it is one title and one meta, the preview folded
 * in and taking its chances with the ellipsis. The author chip stays, because in a shared
 * room *who wrote it* is half of what the row is telling you.
 *
 * The `preview` mode the card carried is gone along with the card stack that needed it —
 * nothing wraps these in an outer button now, so a row can simply be a button.
 */
function SharedSpaceNoteRow({
  cardSlot,
  authorName,
  authorUserId,
  authorFirstName,
  authorProfileImageUrl,
  authorColor,
  isOwn,
  onOpen,
  showEyebrow = true,
}: {
  cardSlot: SharedSpaceNoteCardSlot;
  authorName: string;
  authorUserId: string;
  authorFirstName?: string | null;
  authorProfileImageUrl?: string | null;
  authorColor: string;
  isOwn: boolean;
  onOpen: () => void;
  /** Folded into the meta line. Omitted inside a section whose heading already says it. */
  showEyebrow?: boolean;
}) {
  const { note, eyebrow } = cardSlot;
  const preview = noteRowPreview(note);
  const rel = protoRelativeCaptionAbbrev(note.lastUpdated ?? note.updatedAt ?? note.createdAt ?? null);

  return (
    <PrototypeHomeRow
      icon={noteKindIcon(note.noteType)}
      title={noteRowTitle(note)}
      meta={[
        showEyebrow ? eyebrow : null,
        preview,
        <SharedSpaceNoteAuthorChip
          key="author"
          displayName={authorName}
          userId={authorUserId}
          firstName={authorFirstName}
          profileImageUrl={authorProfileImageUrl}
          color={authorColor}
          isSelf={isOwn}
        />,
        rel,
      ]}
      onClick={onOpen}
    />
  );
}

export default function PrototypeSpaceHub() {
  const fixtureMode = readSharedSpaceDashboardFixtureMode();
  if (fixtureMode) {
    return <SharedSpaceDashboardFixtureView fixture={sharedSpaceDashboardFixtureForMode(fixtureMode)} />;
  }
  return <PrototypeSpaceHubLive />;
}

function PrototypeSpaceHubLive() {
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
    setSidebarListSpaceScope,
    openExpandedSidebar,
    setScriptureDrill,
    ensureSidebarExpanded,
    closeDrawer,
    beginPrototypeComposeSession,
  } = useProtoShell();
  const [peopleOpen, setPeopleOpen] = useState(false);
  /*
   * Which screen the one sheet opens on.
   *
   * There used to be two sheets and two pieces of state: `aboutOpen` for the header's `i` and
   * `peopleOpen` for the gear and the people line. They were the same object — this sheet edits
   * the cover, the name, the description, the rhythm and the roster, and the other displayed
   * exactly those read-only. One sheet now, and this says which door was used.
   */
  const [peopleView, setPeopleView] = useState<'letter' | 'details' | 'invites'>('letter');
  const [toolsOpen, setToolsOpen] = useState(false);
  const toolsButtonRef = useRef<HTMLButtonElement | null>(null);
  const toolsCardRef = useRef<HTMLDivElement | null>(null);
  const { position: toolsPosition, sync: syncToolsPosition } = useProtoAnchoredPopoverPosition(
    toolsCardRef,
    { anchorEl: toolsButtonRef.current },
    /* Right edge to the button's, because the button is at the right of the header — the
       card should hang back under it, not off toward the pane's edge. */
    { enabled: toolsOpen, alignEnd: true },
    [toolsOpen],
  );
  /* The trigger is in the ignore list, not a second watched ref: without it the same press
     that closes the popover reopens it, and the button reads as dead. */
  useDismissOnOutside(toolsCardRef, () => setToolsOpen(false), toolsOpen, {
    ignoreSelector: '[aria-label="Tools"]',
  });
  /*
   * Measure again once the card has its final width.
   *
   * The first pass runs before the popover has settled at the width its own rule gives it, and
   * end-alignment is `anchor.right - cardWidth` — so a width that is 8px short at that instant
   * puts the card 8px right of the button and nothing afterwards moves it back. Left-aligned
   * callers never noticed, because their `left` does not depend on how wide the card is.
   */
  useEffect(() => {
    if (!toolsOpen) return undefined;
    const raf = requestAnimationFrame(() => syncToolsPosition());
    return () => cancelAnimationFrame(raf);
  }, [toolsOpen, syncToolsPosition]);
  const [createThreadOpen, setCreateThreadOpen] = useState(false);
  const [changeThreadOpen, setChangeThreadOpen] = useState(false);
  const [threadTab, setThreadTab] = useState<'current' | 'available'>('current');
  const [drilledThread, setDrilledThread] = useState<SharedThreadDrillTarget | null>(null);
  /* Which space tool is open, if any. Local like the church hub's `toolsView`:
     a route would fight the shell, which hosts the note page. */
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

  /*
    The ministry's other room, when a church has paired them. Asked per room
    rather than read off the nav payload, and resolved live server-side, so a
    channel that was deleted comes back as "unpaired" instead of a chip that
    goes nowhere.
  */
  const switchToSpace = useSwitchToSpace();
  const companionQuery = useSpaceCompanion(activeSpaceId ?? null, {
    enabled: Boolean(ministryMeta.orgId),
  });
  const companionRoom =
    companionQuery.data?.companionChannel ?? companionQuery.data?.companionOfSpace ?? null;

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
  /*
    A space's Tools card, sharing the church hub's row chrome via
    `proto-tools-registry`. When per-space enablement lands it filters this
    array off the space payload (a SpaceTools row per tool), not off another
    hard-coded conditional.
  */
  const spaceLibrary = useSpaceLibrary(activeSpaceId ?? null, {
    /* Every room that is not a personal space has a shelf now — a church one
       reads the church's items scoped to it, any other owns its own. Only a
       personal space has nobody to show it to. */
    enabled: ministryMeta.type !== 'personal',
  });
  const spaceLibraryCount = spaceLibrary.data?.items.length ?? 0;
  const canManageSpaceLibrary = spaceLibrary.data?.canManage ?? false;

  /*
    The room's plan, for the Tools row's count and its visibility. A refusal is
    an ordinary answer here — a member of a church room without `sermon_tools`
    is told no, and the row simply does not appear — so `isError` is read rather
    than surfaced.
  */
  const spacePlan = useChurchSpacePlan(activeSpaceId ?? null, {
    enabled: ministryMeta.type !== 'personal',
  });
  const spacePlanCount = spacePlan.data?.services.length ?? 0;
  const canManageSpacePlan = spacePlan.data?.viewer?.canManage ?? false;
  const spacePlanMeta = useMemo(() => {
    const services = spacePlan.data?.services ?? [];
    /* The next dated gathering is the answer to "what is this for"; a count is
       the fallback when there is nothing upcoming to name.

       `localTodayIso`, not `toISOString` — a service date is a day on the
       room's wall calendar, and UTC turns a Sunday evening into Monday for
       anyone west of it. */
    const today = localTodayIso();
    const next = services
      .filter((s) => s.serviceDate && s.serviceDate >= today)
      .sort((a, b) => String(a.serviceDate).localeCompare(String(b.serviceDate)))[0];
    const when = next?.serviceDate ? parseLocalDateInput(next.serviceDate) : null;
    if (when) {
      return `Next · ${when.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
    }
    if (services.length === 0) return 'Nothing planned yet';
    return `${services.length} planned`;
  }, [spacePlan.data?.services]);
  const spaceToolRows = useMemo<ProtoToolRow[]>(() => {
    const rows: ProtoToolRow[] = [];
    /* Offered to every member, not only whoever curates it — "what do we read
       from" is a question the room asks, and the read is membership-gated.
       Shown to a curator while still empty, because otherwise the one person
       who could put the first thing on the shelf is the one person who cannot
       find it. */
    if (spaceLibraryCount > 0 || canManageSpaceLibrary) {
      rows.push({
        key: 'space-library',
        icon: 'newspaper',
        title: 'Library',
        meta: spaceLibraryMeta(spaceLibrary.data?.items ?? []),
        /* Into the Resources list, scoped to this room — the same surface the
           sidebar's own Resources mode uses, rather than a second shelf that
           looks like the list but is not it. */
        onSelect: () => {
          setSidebarListSpaceScope('space');
          goToListMode('resources');
        },
      });
    }
    /*
      The room's own rhythm. Same bargain as the shelf above: offered to every
      member once there is something to see, and to whoever runs the room while
      it is still empty — otherwise the one person who could plan the first
      gathering is the one person who cannot find where.

      Not on a channel's own view. A channel's plan is reached from the space it
      is paired with, as the second chip, because planning what gets published
      is the same sitting as planning the gathering it comes out of.
    */
    if (!isMinistryChannel && (spacePlanCount > 0 || canManageSpacePlan)) {
      rows.push({
        key: 'space-planner',
        icon: 'calendar',
        title: 'Planner',
        meta: spacePlanMeta,
        chevron: 'expand',
        onSelect: () => {
          if (activeSpaceId) markPendingPlannerIntent({ mode: 'scope', scopeSpaceId: activeSpaceId });
          openExpandedSidebar('planner');
        },
      });
    }
    return rows;
  }, [
    spaceLibraryCount,
    canManageSpaceLibrary,
    spaceLibrary.data?.items,
    isMinistryChannel,
    spacePlanCount,
    canManageSpacePlan,
    spacePlanMeta,
    activeSpaceId,
    openExpandedSidebar,
  ]);

  /*
    The ministry's other room, in a section of its own directly above Tools.

    Not a tool: everything under Tools is something you do to this room, and
    this is a door out of it. Its own eyebrow says the relationship, which frees
    the row to be the plain name of where you would land — and keeps Tools the
    last section, as the room's activity already keeps it below the cards.

    It carries none of that room's colour. A companion is a sibling, not a
    source, and tinting by it would imply this room's material came from there —
    settled once already in the linking post-mortem.

    It used to be a chip in the header, a third stacked line under the title
    costing about a quarter of the header's height.
  */
  const companionRows = useMemo<ProtoToolRow[]>(() => {
    const companion = companionToolRow(companionRoom, isMinistryChannel);
    if (!companion) return [];
    return [
      {
        key: 'space-companion',
        icon: companion.icon,
        title: companion.title,
        meta: companion.meta,
        onSelect: () => {
          ensureSidebarExpanded();
          switchToSpace(companion.spaceId);
        },
      },
    ];
  }, [companionRoom, isMinistryChannel, ensureSidebarExpanded, switchToSpace]);

  const canModerateChannel = canModerateMinistryChannel({
    isOwner: isSpaceOwner,
    membershipRole,
    type: ministryMeta.type,
    orgId: ministryMeta.orgId,
  });

  const openPeopleSheet = (view: 'letter' | 'details' | 'invites' = 'letter') => {
    if (isMinistryChannel && !canModerateChannel) return;
    setPeopleView(view);
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

  // Same reason as Home's: the activity preview holds its answer for a few seconds and this
  // view can paint from it before the delete's refetch lands.
  const [, setDeletedTick] = useState(0);
  useEffect(() => subscribeDeletedNotes(() => setDeletedTick((t) => t + 1)), []);
  const deletedNoteKey = deletedNoteIds().join(',');
  const noteCardSlots = useMemo(
    () =>
      buildSharedSpaceNoteCardSlots({
        recentNotes,
        notesForContinue,
        unseenSince,
        authUserId,
        deletedNoteIds: deletedNoteKey ? deletedNoteKey.split(',') : [],
      }),
    [recentNotes, notesForContinue, unseenSince, authUserId, deletedNoteKey],
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
  /*
    A Thread as a Home row.

    Was a card with a *nested* button for the title and another for "Set current" — a button
    inside a button, which is invalid, and the reason the title needed its own click target
    instead of the card carrying it. `trailing` is the shape that problem wanted: the body is
    the tap target, the action sits beside it, neither contains the other.
  */
  const renderThreadRow = (thread: SpaceGroupStudyThread) => {
    const isCurrent = thread.id === threadDashboard.currentThread?.id;
    const stacked = threadStackItems.length > 1;
    return (
      <PrototypeHomeRow
        key={thread.id}
        icon="arrow-right-arrow-left"
        title={thread.title}
        meta={[
          // Only worth saying which one is current once there is more than one.
          isCurrent && stacked ? 'Current' : null,
          // A study plan says where the group is; a collection says how big it is.
          sequenceStepLabel(thread) ?? sharedThreadNoteCountPreview(thread.noteCount),
        ]}
        onClick={() => openThread(thread)}
        trailing={
          !isCurrent ? (
            <button
              type="button"
              className="proto-shared-thread-action"
              disabled={setCurrentThread.isPending}
              onClick={(e) => {
                e.stopPropagation();
                void makeThreadCurrent(thread.id).catch((error) => {
                  setThreadPinError(
                    error instanceof Error ? error.message : 'Could not set this Thread as current.',
                  );
                });
              }}
            >
              Set current
            </button>
          ) : undefined
        }
      />
    );
  };

  const renderNoteRow = (slot: SharedSpaceNoteCardSlot, showEyebrow = true) => {
    const author = resolveAuthor(slot.note);
    return (
      <SharedSpaceNoteRow
        key={slot.note.id}
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

  /*
    One frame, four exits.
    
    This view leaves by four different doors — an error, a loading state, a thread drilldown and
    the dashboard itself — and each of them used to name its own root element. Naming the chrome
    once is how three of the four stop drifting from the fourth; it is also what made moving this
    surface off the rail a one-line change rather than four.
  */
  const frame = (children: ReactNode) => (
    <article className="proto-feed-sheet proto-shared-space-dashboard proto-shared-space-dashboard--sheet">
      {children}
    </article>
  );

  if (dashboardHasError) {
    return frame(
      <div className="proto-shared-thread-state" role="alert">
        <p>Could not load this shared space.</p>
        <button type="button" className="proto-shared-thread-action" onClick={retryDashboard}>
          Retry
        </button>
      </div>,
    );
  }

  if (!contentReady) {
    return frame(<ProtoSpaceLoading label="Loading space" />);
  }


  if (drilledThread) {
    return frame(
      <PrototypeSharedThreadDrilldown
        framed
        thread={drilledThread}
        spaceId={activeSpaceId}
        isOwner={canManageThreads}
        /* Same verdict the server enforces: owner or leader, never a channel. */
        canManageStructure={canManageThreads}
        canCompose={canComposeHere}
        backLabel={spaceTitle}
        onBack={() => setDrilledThread(null)}
        onCompose={() => composeInSharedSpace(drilledThread.id)}
        onSetCurrent={makeThreadCurrent}
        onThreadUpdated={(patch) => {
          setDrilledThread((current) => (current ? { ...current, ...patch } : current));
        }}
      />,
    );
  }

  /*
   * The room's own cover, as the invite letter shows it.
   *
   * Same three fields `SharedSpaceAboutSheet` maps for its hero, because it is the same cover:
   * the image someone chose for this space, or the accent gradient standing in for one. Kept
   * beside the header it feeds rather than hoisted, so the mapping is read where it is used.
   */
  const heroSpace = space
    ? {
        color: space.color ?? undefined,
        backgroundGradient: space.backgroundGradient,
        cover: { light: space.coverBgLight ?? null, dark: space.coverBgDark ?? null },
      }
    : null;

  return frame(
    <>
      <div className="proto-shared-space-header proto-shared-space-header--cover">
        {/*
          The same hero the invite and the About sheet show, at the top of the room itself.

          A shared space had one visual anywhere — the cover on the letter that invited you —
          and then you walked in and the room was a 30px tile and a line of text. Being in a
          place should look like the place. `PublicJoinSpaceHero` rather than a second band of
          our own: it already resolves image-or-gradient per colour scheme and holds the
          placeholder until the image has decoded, and a copy would be the thing that drifts
          from the letter it is supposed to match.
        */}
        <div className="proto-shared-space-header__cover">
          <PublicJoinSpaceHero space={heroSpace} />
        </div>
        <div className="proto-shared-space-header__row">
          {/* The letter's own tile, at the letter's own proportions: 52px at radius 12 with a
              22px glyph, which is the ~0.42 ratio `glyphSize`'s doc names for exactly this. */}
          <ProtoSpaceMenuIcon
            color={space?.color || 'paper'}
            size={52}
            radius={12}
            glyphSize={22}
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
            {/* The word lands on the thing it names: "Invite" opens the invite links, the
                count beside it opens what the room is. */}
            {!isMinistryChannel ? (
              <button
                type="button"
                className="proto-shared-space-header__people"
                onClick={(e) =>
                  openPeopleSheet(
                    (e.target as HTMLElement).closest('.proto-shared-space-header__invite')
                      ? 'invites'
                      : 'letter',
                  )
                }
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
        </div>
        {/* The header's controls, not the identity line's — and they have to be a child of the
            header to be positioned against it, since the row below is its own positioning
            context. */}
        <div className="proto-shared-space-header__actions">
            <button
              type="button"
              className="proto-toolbar-icon-btn"
              aria-label={isMinistryChannel ? 'About this channel' : 'About this space'}
              title={isMinistryChannel ? 'About this channel' : 'About this space'}
              onClick={() => openPeopleSheet('letter')}
            >
              <Icon name="circle-info" size={15} />
            </button>
            {/*
              Tools, where the gear used to be.
              
              The gear went because it had nowhere left to go that the `i` beside it did not
              already reach: settings is a row inside that sheet, one tap in. Its slot is worth
              more to the room's own tools, which were the last section of a scrolling page —
              so the shelf and the planner, the two places you actually go from here, cost a
              scroll to the bottom to find.
              
              The header is where a room's navigation belongs; the body is what is happening in
              it. Absent when the room has no tools to offer, rather than opening on nothing.
            */}
            {spaceToolRows.length > 0 ? (
              <button
                type="button"
                ref={toolsButtonRef}
                className="proto-toolbar-icon-btn"
                title="Tools"
                aria-label="Tools"
                aria-haspopup="menu"
                aria-expanded={toolsOpen}
                onClick={() => setToolsOpen((v) => !v)}
              >
                {/* Shapes, not a wrench: the two things behind this are a shelf and a
                    calendar — places you go, not repairs you make. A grid of cells was the
                    other candidate and reads as a view switcher, which is what it means
                    everywhere else in this app. */}
                <Icon name="shapes" size={15} />
              </button>
            ) : null}
        </div>
      </div>

      <div className="proto-sidebar-scroll">
        <div className={homeViewClassName}>
          {/*
            What this room is studying next. Staff-gated server-side, so it is
            only requested for someone who can already see the church's plans;
            everyone else, and every space without a plan, renders nothing.
          */}
          {/* Members, not just staff: the read is membership-gated now, so the
              people who actually gather here see what the room is on. Still
              only asked of a church room — a personal Shared Space has no
              plan to answer with. */}
          {/* Any room that can hold a plan can say what is coming up. The org
              condition predated churchless plans; the endpoint behind it was
              only ever gated on membership. */}
          <PrototypeSpaceComingUp
            spaceId={activeSpaceId ?? null}
            enabled={ministryMeta.type !== 'personal'}
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
                onOpenPeople={
                  isMinistryChannel && !canModerateChannel ? undefined : () => openPeopleSheet('letter')
                }
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
                  {/* Rows in one panel, not a pile of cards to expand. A list you can read
                      beats a stack you have to open. */}
                  <div className="proto-glass-surface proto-glass-surface--panel proto-list-panel">
                    {availableThreads.map((thread) => renderThreadRow(thread))}
                  </div>
                  {threadPinError ? (
                    <p className="proto-connect-note-sheet__error" role="alert">
                      {threadPinError}
                    </p>
                  ) : null}
                </>
              ) : threadStackItems.length > 0 ? (
                <>
                  <div className="proto-glass-surface proto-glass-surface--panel proto-list-panel">
                    {threadStackItems.map((thread) => renderThreadRow(thread))}
                  </div>
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

              {/*
                One section per group, rows inside. The heading already says which shelf
                this is, so the rows drop their own eyebrow — the trade Home makes. A
                single-note group is a section of one rather than a lone card, so a room
                with one recent note looks like a room and not a different layout.
              */}
              {noteCardGroups.map((group) => (
                <HomeSection key={`${group.eyebrow}-${group.slots[0].note.id}`} title={group.eyebrow}>
                  {group.slots.map((slot) => renderNoteRow(slot, false))}
                </HomeSection>
              ))}

            </>
          )}

          {companionRows.length > 0 ? (
            <div className="proto-home-section">
              <p className="proto-caption proto-home-section__eyebrow">Paired with</p>
              <ProtoToolsRowList rows={companionRows} />
            </div>
          ) : null}

        </div>
      </div>

      {/*
        The tools, in a popover, as the same rows the section used to draw.

        `ProtoToolsRowList` rather than a menu of its own, so the shelf and the planner look
        here exactly as they looked in the body — same icon, same title, same count line, same
        chevron — and a change to one is a change to both.
      */}
      {toolsOpen
        ? createPortal(
            <ProtoPopoverShell
              ref={toolsCardRef}
              className="proto-menu__popover proto-space-tools-popover"
              role="menu"
              aria-label="Tools"
              /* Parked offscreen until it has been measured — the position is computed from
                 the rendered card, so gating the render on it would mean it never renders.
                 The house pattern, same as the change-thread sheet. */
              style={{
                position: 'fixed',
                top: toolsPosition?.top ?? -9999,
                left: toolsPosition?.left ?? -9999,
                zIndex: 6000,
              }}
            >
              <ProtoToolsRowList
                rows={spaceToolRows.map((row) => ({
                  ...row,
                  onSelect: () => {
                    setToolsOpen(false);
                    row.onSelect();
                  },
                }))}
              />
            </ProtoPopoverShell>,
            document.body,
          )
        : null}

      <PrototypeSpacePeopleSheet
        open={peopleOpen}
        onOpenChange={setPeopleOpen}
        initialView={peopleView}
        spaceId={activeSpaceId}
        spaceTitle={spaceTitle}
        spaceColor={space?.color}
        spaceDescription={space?.description}
        spaceCoverBgLight={space?.coverBgLight}
        spacePublishCadence={space?.publishCadence}
        spaceCadenceStale={space?.cadenceStale}
        spaceMeetingDay={space?.meetingDay ?? null}
        spaceMeetingTime={space?.meetingTime ?? null}
        spaceMeetingKind={space?.meetingKind ?? null}
        spaceMeetingUrl={space?.meetingUrl ?? null}
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
    </>,
  );
}
