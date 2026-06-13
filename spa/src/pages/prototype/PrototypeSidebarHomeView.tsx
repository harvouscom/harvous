/**
 * Home space view — the 'space' sidebar layer. A greeting with inline stat
 * chips, anchored by Today's Passage, then a continue-where-you-left-off card.
 * Future space content (recall/review, groups) lands here.
 * Greeting copy follows docs/BRAND_VOICE.md — friend-over-coffee, no hype.
 */
import { useMemo, useRef } from 'react';
import Icon from '@/components/react/Icon';
import type { SpaceNoteRow } from '../../hooks/queries/useSpace';
import type { ScriptureIndexBook } from '../../hooks/queries/usePrototypeSpaceScriptureIndex';
import type { TagSummary } from '../../hooks/queries/useTagsList';
import { useTagsList } from '../../hooks/queries/useTagsList';
import { getCachedUserNames, useProfile } from '../../hooks/queries/useProfile';
import { useVotdToday } from '../../hooks/queries/useVotdToday';
import type { PrototypeNotesListPhase } from '@/utils/prototype-notes-list-phase';
import {
  isPrototypeHomeContentReady,
  isQuerySettled,
} from '@/utils/prototype-home-ready';
import {
  computeActivityRhythm,
  computeActivityStreak,
  deriveTopPassages,
  deriveTopFolders,
  deriveTopTags,
  formatActivityRhythm,
  formatHomeNoteCount,
  greetingForHour,
  homePassageGreetingTone,
  pickHomeEncouragement,
  pickContinueNote,
} from '@/utils/prototype-home-trends';
import { stripServerAutoUntitledNoteTitleForDisplay } from '@/utils/server-auto-untitled-note-display';
import { stripHtmlForListPreview } from '@/utils/html-stripper';
import { protoRelativeCaption, protoRelativeCaptionAbbrev } from './proto-time';
import PrototypeDailyPassagePill from './PrototypeDailyPassagePill';
import { useProtoShell } from '../../layouts/proto-shell-context';

type Props = {
  homeSpaceId: string;
  notes: SpaceNoteRow[];
  notesListPhase: PrototypeNotesListPhase;
  hasMoreNotes: boolean;
  scriptureBooks: ScriptureIndexBook[];
  scriptureSettled: boolean;
  onOpenNote: (row: SpaceNoteRow) => void;
  prefetchNote: (row: SpaceNoteRow) => void;
  onOpenScripturePassage: (bookOrder: number) => void;
};

function ProtoHomeLoading() {
  return (
    <div className="proto-home-loading">
      <span className="load-more-indicator" aria-label="Loading home">
        <span className="load-more-indicator__dot" />
        <span className="load-more-indicator__dot" />
        <span className="load-more-indicator__dot" />
      </span>
    </div>
  );
}

function HomeGreeting({
  notes,
  hasMoreNotes,
  scriptureBooks,
  tags,
  onOpenScripturePassage,
}: Pick<Props, 'notes' | 'hasMoreNotes' | 'scriptureBooks' | 'onOpenScripturePassage'> & {
  tags: TagSummary[];
}) {
  const { data: profile } = useProfile();
  const { setSidebarListMode, setSidebarFolderDrilldown, ensureSidebarExpanded, openSidebarTagSearch } =
    useProtoShell();

  const firstName = useMemo(() => {
    const fromProfile = profile?.firstName?.trim() || profile?.displayName?.split(' ')[0]?.trim();
    if (fromProfile && fromProfile !== 'User') return fromProfile;
    const cached = getCachedUserNames()?.firstName?.trim();
    return cached || '';
  }, [profile]);

  const topPassage = useMemo(() => deriveTopPassages(scriptureBooks, 1)[0], [scriptureBooks]);
  const topFolder = useMemo(() => deriveTopFolders(notes, 1)[0], [notes]);
  const topTag = useMemo(() => deriveTopTags(tags, 1)[0], [tags]);
  const streak = useMemo(() => computeActivityStreak(notes, new Date()), [notes]);
  const rhythm = useMemo(() => computeActivityRhythm(notes), [notes]);

  const hello = `${greetingForHour(new Date().getHours())}${firstName ? `, ${firstName}` : ''}.`;
  const closer = useMemo(
    () =>
      pickHomeEncouragement({
        noteCount: notes.length,
        hasMoreNotes,
        streak,
        streakShownInGreeting: Boolean(streak),
        hasTopPassage: Boolean(topPassage),
        hour: new Date().getHours(),
        today: new Date(),
      }),
    [notes.length, hasMoreNotes, streak, topPassage],
  );

  const passageTone = topPassage
    ? homePassageGreetingTone({
        noteCount: notes.length,
        hasMoreNotes,
        referenceCount: topPassage.referenceCount,
      })
    : null;

  const singleNoteAddedRel = useMemo(() => {
    if (notes.length !== 1 || hasMoreNotes) return '';
    const note = notes[0];
    return protoRelativeCaption(note.lastVisited ?? note.updatedAt ?? note.createdAt ?? null);
  }, [notes, hasMoreNotes]);

  const passageChip = topPassage ? (
    <button
      type="button"
      className="proto-glass-surface proto-home-greeting__chip proto-home-greeting__chip--passage"
      onClick={() => onOpenScripturePassage(topPassage.bookOrder)}
    >
      <Icon name="book" size={11} aria-hidden />
      <span>{topPassage.displayRef}</span>
    </button>
  ) : null;
  const folderChip = topFolder ? (
    <button
      type="button"
      className="proto-glass-surface proto-home-greeting__chip proto-home-greeting__chip--folder"
      aria-label={`Browse folder ${topFolder.name}`}
      onClick={() => {
        setSidebarListMode('folders');
        setSidebarFolderDrilldown(topFolder.name);
        ensureSidebarExpanded();
      }}
    >
      <Icon name="folder" size={10} aria-hidden />
      <span>{topFolder.name}</span>
    </button>
  ) : null;
  const tagChip = topTag ? (
    <button
      type="button"
      className="proto-glass-surface proto-home-greeting__chip proto-home-greeting__chip--tag"
      aria-label={`Search notes tagged ${topTag.name}`}
      onClick={() => {
        openSidebarTagSearch({ tagId: topTag.id, tagName: topTag.name });
      }}
    >
      <Icon name="tag" size={10} aria-hidden />
      <span>{topTag.name}</span>
    </button>
  ) : null;
  const folderTrend = folderChip ? <> and {folderChip} keeps showing up</> : null;
  const tagTrend = tagChip ? <>, and {tagChip} keeps showing up too</> : null;
  const singleNoteFolder = folderChip ? <> in {folderChip}</> : null;
  const singleNoteTag = tagChip ? <> with {tagChip} tagged on it</> : null;
  const countChip = (
    <button
      type="button"
      className="proto-glass-surface proto-home-greeting__chip proto-home-greeting__chip--count"
      aria-label="View notes list"
      onClick={() => {
        setSidebarListMode('notes');
        ensureSidebarExpanded();
      }}
    >
      <span>{formatHomeNoteCount(notes.length, hasMoreNotes)}</span>
    </button>
  );
  const streakLabel = streak
    ? `${streak.count} ${streak.unit === 'day' ? 'days' : 'weeks'} in a row`
    : null;
  const rhythmLabel = rhythm ? formatActivityRhythm(rhythm) : null;

  return (
    <p className="proto-home-greeting">
      <span className="proto-home-greeting__hello">{hello}</span>{' '}
      {notes.length > 0 ? (
        <>
          {passageChip ? (
            passageTone === 'single-note' ? (
              <>
                {singleNoteAddedRel === 'Just now' ? (
                  <>You just added {passageChip}</>
                ) : (
                  <>
                    You added {passageChip}
                    {singleNoteAddedRel ? <> {singleNoteAddedRel}</> : null}
                  </>
                )}
                {singleNoteFolder}
                {singleNoteTag} and {countChip} saved so far.{' '}
              </>
            ) : passageTone === 'mentioned-once' ? (
              <>
                {passageChip} shows up in your notes
                {folderTrend}
                {tagTrend} with {countChip} saved so far.{' '}
              </>
            ) : (
              <>
                You keep coming back to {passageChip}
                {folderTrend}
                {tagTrend} with {countChip} saved so far.{' '}
              </>
            )
          ) : folderChip ? (
            <>{folderChip} keeps showing up in your folders. You have {countChip} saved so far. </>
          ) : tagChip ? (
            <>{tagChip} keeps showing up in your notes. You have {countChip} saved so far. </>
          ) : (
            <>You have {countChip} saved so far. </>
          )}
          {rhythmLabel ? <>You {rhythmLabel}. </> : null}
          {streakLabel ? <>You&apos;ve shown up {streakLabel} now. {closer}</> : <>{closer}</>}
        </>
      ) : null}
    </p>
  );
}

export default function PrototypeSidebarHomeView({
  homeSpaceId,
  notes,
  notesListPhase,
  hasMoreNotes,
  scriptureBooks,
  scriptureSettled,
  onOpenNote,
  prefetchNote,
  onOpenScripturePassage,
}: Props) {
  const tagsQuery = useTagsList();
  const votdQuery = useVotdToday({ enabled: Boolean(homeSpaceId) });

  const tagsSettled = isQuerySettled(tagsQuery.isPending, tagsQuery.data != null);
  const votdSettled =
    isQuerySettled(votdQuery.isPending, votdQuery.data != null) || Boolean(votdQuery.isError);
  const contentReady = isPrototypeHomeContentReady({
    notesListPhase,
    scriptureSettled,
    tagsSettled,
    votdSettled,
  });

  const shouldAnimateRef = useRef(false);
  if (contentReady && !shouldAnimateRef.current) {
    shouldAnimateRef.current = true;
  }

  const continueNote = useMemo(() => pickContinueNote(notes), [notes]);
  const tags = tagsQuery.data?.tags ?? [];
  const votd = votdQuery.data;

  const continueTitle = continueNote
    ? stripServerAutoUntitledNoteTitleForDisplay(continueNote.title?.trim() ?? '') || 'New Note'
    : '';
  const continuePreview = continueNote?.content ? stripHtmlForListPreview(continueNote.content, 90) : '';
  const continueRel = continueNote
    ? protoRelativeCaptionAbbrev(continueNote.lastVisited ?? continueNote.updatedAt ?? continueNote.createdAt ?? null)
    : '';

  if (!contentReady) {
    return <ProtoHomeLoading />;
  }

  return (
    <div className={`proto-home-view${shouldAnimateRef.current ? ' proto-home-view--enter' : ''}`}>
      <div className="proto-home-section">
        <HomeGreeting
          notes={notes}
          hasMoreNotes={hasMoreNotes}
          scriptureBooks={scriptureBooks}
          tags={tags}
          onOpenScripturePassage={onOpenScripturePassage}
        />
      </div>

      {votd ? (
        <div className="proto-home-section">
          <PrototypeDailyPassagePill homeSpaceId={homeSpaceId} notes={notes} votd={votd} />
        </div>
      ) : null}

      <div className="proto-home-section">
        {notesListPhase === 'empty' ? (
          <div className="proto-glass-surface proto-glass-surface--panel proto-home-card">
            <div className="proto-home-card__body">
              <div className="proto-home-card__title-row">
                <span className="proto-home-card__icon-orb" aria-hidden>
                  <Icon name="note-sticky" size={13} />
                </span>
                <p className="pds-list-title proto-home-card__title">No notes yet</p>
              </div>
              <p className="pds-list-preview proto-home-card__preview">Create your first note and your Home will fill in.</p>
            </div>
          </div>
        ) : continueNote ? (
          <button
            type="button"
            className="proto-glass-surface proto-glass-surface--panel proto-home-card proto-home-card--tappable"
            onClick={() => onOpenNote(continueNote)}
            onMouseEnter={() => prefetchNote(continueNote)}
            onFocus={() => prefetchNote(continueNote)}
          >
            <p className="proto-caption proto-home-card__eyebrow">Pick up where you left off</p>
            <div className="proto-home-card__body">
              <div className="proto-home-card__title-row">
                <p className="pds-list-title proto-home-card__title">{continueTitle}</p>
                <span className="proto-home-card__chevron" aria-hidden>
                  <Icon name="chevron-right" size={11} />
                </span>
              </div>
              {continuePreview ? (
                <p className="pds-list-preview proto-home-card__preview">{continuePreview}</p>
              ) : null}
              <div className="proto-home-card__meta">
                {continueRel ? <span className="proto-home-card__meta-item">{continueRel}</span> : null}
                {continueRel && continueNote.primaryCollection ? (
                  <span className="proto-home-card__meta-sep">in</span>
                ) : null}
                {continueNote.primaryCollection ? (
                  <span className="proto-home-card__meta-item">
                    <Icon name="folder" size={10} aria-hidden />
                    {continueNote.primaryCollection}
                  </span>
                ) : null}
              </div>
            </div>
          </button>
        ) : null}
      </div>
    </div>
  );
}
