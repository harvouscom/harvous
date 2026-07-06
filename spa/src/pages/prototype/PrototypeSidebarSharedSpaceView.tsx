/**
 * Shared/public space view — sidebar 'space' layer dashboard (not the full notes list).
 */
import { useMemo, useState, useEffect } from 'react';
import Icon, { type IconName } from '@/components/react/Icon';
import { useAuth, useUser } from '@clerk/clerk-react';
import { useNavigate } from '@tanstack/react-router';
import { toast } from '@/utils/toast';
import { resolveProfileFirstName } from '@/utils/nav-avatar-initials';
import { homeSpotlightThreadEyebrow } from '@/utils/prototype-home-trends';
import { isQuerySettled } from '@/utils/prototype-home-ready';
import { useActiveSpace } from '../../hooks/useActiveSpace';
import { useSpace, useSpaceMembers, useSpaceNotes, type SpaceNoteRow } from '../../hooks/queries/useSpace';
import { usePrototypeStudyThreads } from '../../hooks/queries/usePrototypeStudyThreads';
import { usePrototypeSpaceScriptureIndex } from '../../hooks/queries/usePrototypeSpaceScriptureIndex';
import {
  getSharedSpaceUnseenSince,
  useSharedSpaceActivityPreview,
  useSharedSpaceVisit,
} from '../../hooks/useSharedSpaceVisit';
import { useProtoShell } from '../../layouts/proto-shell-context';
import type { SidebarListMode } from '../../layouts/proto-shell-context';
import { prototypeNoteRouteTo } from '@/lib/prototype-path';
import { noteParamSlug } from './proto-route-slugs';
import { protoRelativeCaptionAbbrev } from './proto-time';
import { stripServerAutoUntitledNoteTitleForDisplay } from '@/utils/server-auto-untitled-note-display';
import { stripHtmlForListPreview } from '@/utils/html-stripper';
import SharedSpaceNoteAuthorChip from './SharedSpaceNoteAuthorChip';
import PrototypeSpacePeopleSheet from './PrototypeSpacePeopleSheet';
import ProtoSpaceMenuIcon from './ProtoSpaceMenuIcon';
import ProtoSpaceLoading from './ProtoSpaceLoading';
import {
  buildSharedSpaceNoteCardSlots,
  buildSharedSpaceSocialIntro,
  selectSpotlightThreadForSpace,
  selectTopSharedPassage,
  sharedSpacePeopleHeaderLabel,
  type SharedSpaceNoteCardSlot,
} from './shared-space-dashboard';
import SharedSpaceSocialGreeting from './SharedSpaceSocialGreeting';
import SharedSpaceAboutSheet from './SharedSpaceAboutSheet';
import {
  readSharedSpaceDashboardFixtureMode,
  sharedSpaceDashboardFixtureForMode,
} from '../dev/shared-spaces-design/shared-space-dashboard-fixture-mode';
import SharedSpaceDashboardFixtureView from '../dev/shared-spaces-design/SharedSpaceDashboardFixtureView';

const PREVIEW_MAX = 90;
const RECENT_PREVIEW_LIMIT = 3;

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
  slot,
  authorName,
  authorColor,
  isOwn,
  onOpen,
}: {
  slot: SharedSpaceNoteCardSlot;
  authorName: string;
  authorColor: string;
  isOwn: boolean;
  onOpen: () => void;
}) {
  const { note, eyebrow } = slot;
  const preview = noteRowPreview(note);
  const rel = protoRelativeCaptionAbbrev(note.lastUpdated ?? note.updatedAt ?? note.createdAt ?? null);

  return (
    <button
      type="button"
      className="proto-glass-surface proto-glass-surface--panel proto-home-card proto-home-card--tappable"
      onClick={onOpen}
    >
      <p className="proto-caption proto-home-card__eyebrow">{eyebrow}</p>
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
        {preview ? <p className="pds-list-preview proto-home-card__preview">{preview}</p> : null}
        <div className="proto-home-card__meta">
          <SharedSpaceNoteAuthorChip displayName={authorName} color={authorColor} isSelf={isOwn} />
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
    </button>
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
  const { activeSpaceId, isOwner, spaceTitle: resolvedSpaceTitle } = useActiveSpace();
  const {
    setSidebarLayer,
    setSidebarListMode,
    setSidebarThreadDrilldownId,
    setScriptureDrill,
    ensureSidebarExpanded,
  } = useProtoShell();
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);

  const spaceQuery = useSpace(activeSpaceId ?? '');
  const membersQuery = useSpaceMembers(activeSpaceId ?? '');
  const activityQuery = useSharedSpaceActivityPreview(activeSpaceId);
  const notesQuery = useSpaceNotes(activeSpaceId ?? '', 20);
  const threadsQuery = usePrototypeStudyThreads(activeSpaceId ?? undefined);
  const scriptureQuery = usePrototypeSpaceScriptureIndex(activeSpaceId ?? undefined);
  const { newNoteCount: visitNewCount } = useSharedSpaceVisit(activeSpaceId);

  const space = spaceQuery.data;
  const members = membersQuery.data?.members ?? [];
  const peopleCount = membersQuery.data?.memberCount ?? (members.length || 1);
  const spaceTitle = resolvedSpaceTitle ?? space?.title ?? 'Shared space';

  const selfDisplayName = resolveProfileFirstName(user) || 'You';
  const isSpaceOwner =
    membersQuery.data?.isOwner ??
    (members.some((m) => m.userId === authUserId && m.role === 'owner') ||
      Boolean(space?.isOwner) ||
      isOwner);

  const openPeopleSheet = () => {
    setAboutOpen(false);
    setPeopleOpen(true);
  };
  const recentNotes = activityQuery.data?.recentNotes ?? [];
  const totalNoteCount = activityQuery.data?.totalNoteCount ?? recentNotes.length;
  const bannerNewCount = visitNewCount || activityQuery.data?.newNoteCount || 0;
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

  const spotlightThread = useMemo(
    () => selectSpotlightThreadForSpace(threadsQuery.data ?? []),
    [threadsQuery.data],
  );

  const topPassage = useMemo(
    () => selectTopSharedPassage(scriptureQuery.data ?? []),
    [scriptureQuery.data],
  );

  const threadsSettled = isQuerySettled(threadsQuery.isPending, threadsQuery.data != null);
  const scriptureSettled = isQuerySettled(scriptureQuery.isPending, scriptureQuery.data != null);
  const notesSettled = isQuerySettled(notesQuery.isPending, notesQuery.data != null);

  const goToListMode = (mode: SidebarListMode) => {
    ensureSidebarExpanded();
    setSidebarLayer('list');
    setSidebarListMode(mode);
  };

  const goToNotesList = () => goToListMode('notes');

  const openNote = (note: SpaceNoteRow) => {
    navigate({ to: prototypeNoteRouteTo(), params: { noteId: noteParamSlug(note.id) } });
  };

  const openThread = (threadId: string) => {
    const slug = threadId.startsWith('note_') ? threadId.slice('note_'.length) : threadId;
    setSidebarListMode('threads');
    setSidebarThreadDrilldownId(slug);
    setSidebarLayer('list');
    ensureSidebarExpanded();
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
    const authorName = isOwn ? 'You' : (note.authorDisplayName ?? 'Member');
    const authorColor = isOwn
      ? (membersQuery.data?.members.find((m) => m.userId === authUserId)?.userColor ?? 'blue')
      : (note.authorColor ?? 'blue');
    return { isOwn, authorName, authorColor };
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

  const contentReady =
    !spaceQuery.isPending &&
    !activityQuery.isLoading &&
    notesSettled &&
    threadsSettled &&
    scriptureSettled;

  if (!contentReady) {
    return (
      <div className="proto-sidebar-root proto-shared-space-dashboard">
        <ProtoSpaceLoading label="Loading space" />
      </div>
    );
  }

  return (
    <div className="proto-sidebar-root proto-shared-space-dashboard">
      <div className="proto-shared-space-header">
        <div className="proto-shared-space-header__row">
          <ProtoSpaceMenuIcon color={space?.color || 'paper'} size={30} radius={9} />
          <div className="proto-shared-space-header__meta">
            <div className="pds-list-title proto-shared-space-header__title" title={spaceTitle}>
              {spaceTitle}
            </div>
            <button
              type="button"
              className="proto-shared-space-header__people"
              onClick={openPeopleSheet}
            >
              <span>{sharedSpacePeopleHeaderLabel(peopleCount)}</span>
              {isSpaceOwner ? (
                <>
                  <span className="proto-shared-space-header__dot" aria-hidden>
                    ·
                  </span>
                  <span className="proto-shared-space-header__invite">Invite</span>
                </>
              ) : null}
            </button>
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
            {isSpaceOwner ? (
              <button
                type="button"
                className="proto-toolbar-icon-btn"
                title="Space settings"
                aria-label="Space settings"
                onClick={openPeopleSheet}
              >
                <Icon name="gear" size={15} />
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="proto-sidebar-scroll">
        <div className="proto-home-view">
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
                onOpenPeople={openPeopleSheet}
              />
            </div>
          ) : null}

          {totalNoteCount === 0 ? (
            <div className="proto-home-section">
              <button
                type="button"
                className="proto-glass-surface proto-glass-surface--panel proto-home-card proto-home-card--tappable"
                onClick={goToNotesList}
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
                    Create the first note in {spaceTitle}...
                  </p>
                </div>
              </button>
            </div>
          ) : (
            <>
              {spotlightThread ? (
                <div className="proto-home-section">
                  <button
                    type="button"
                    className="proto-glass-surface proto-glass-surface--panel proto-home-card proto-home-card--tappable"
                    onClick={() => openThread(spotlightThread.id)}
                  >
                    <p className="proto-caption proto-home-card__eyebrow">
                      {homeSpotlightThreadEyebrow(spotlightThread.noteCount)}
                    </p>
                    <div className="proto-home-card__body">
                      <div className="proto-home-card__title-row">
                        <span className="proto-home-card__icon-orb" aria-hidden>
                          <Icon name="arrow-right-arrow-left" size={13} />
                        </span>
                        <p className="pds-list-title proto-home-card__title">{spotlightThread.title}</p>
                        <span className="proto-home-card__chevron" aria-hidden>
                          <Icon name="caret-right" size={11} />
                        </span>
                      </div>
                      <div className="proto-home-card__meta">
                        <span className="proto-home-card__meta-item">
                          {spotlightThread.noteCount}{' '}
                          {spotlightThread.noteCount === 1 ? 'note' : 'notes'} in this space
                        </span>
                      </div>
                    </div>
                  </button>
                </div>
              ) : null}

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
                          <Icon name="book" size={13} />
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

              {noteCardSlots.map((slot) => {
                const { isOwn, authorName, authorColor } = resolveAuthor(slot.note);
                return (
                  <div key={slot.note.id} className="proto-home-section">
                    <SharedSpaceNoteCard
                      slot={slot}
                      authorName={authorName}
                      authorColor={authorColor}
                      isOwn={isOwn}
                      onOpen={() => openNote(slot.note)}
                    />
                  </div>
                );
              })}

            </>
          )}
        </div>
      </div>

      <SharedSpaceAboutSheet
        open={aboutOpen}
        onOpenChange={setAboutOpen}
        space={space ?? null}
        members={members}
      />

      <PrototypeSpacePeopleSheet
        open={peopleOpen}
        onOpenChange={setPeopleOpen}
        spaceId={activeSpaceId}
        spaceTitle={spaceTitle}
        spaceColor={space?.color}
        spaceDescription={space?.description}
        viewerIsOwner={isSpaceOwner}
      />
    </div>
  );
}
