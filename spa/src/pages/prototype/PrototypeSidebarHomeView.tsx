/**
 * Home space view — the 'space' sidebar layer. A greeting with inline stat
 * chips, anchored by Today's Passage, then a continue-where-you-left-off card.
 * Future space content (recall/review, groups) lands here.
 * Greeting copy follows docs/BRAND_VOICE.md — friend-over-coffee, no hype.
 */
import { useMemo } from 'react';
import Icon from '@/components/react/Icon';
import type { SpaceNoteRow } from '../../hooks/queries/useSpace';
import type { ScriptureIndexBook } from '../../hooks/queries/usePrototypeSpaceScriptureIndex';
import { useTagsList } from '../../hooks/queries/useTagsList';
import { getCachedUserNames, useProfile } from '../../hooks/queries/useProfile';
import type { PrototypeNotesListPhase } from '@/utils/prototype-notes-list-phase';
import {
  computeActivityStreak,
  deriveTopPassages,
  deriveTopTags,
  formatHomeNoteCount,
  greetingForHour,
  pickContinueNote,
} from '@/utils/prototype-home-trends';
import { stripServerAutoUntitledNoteTitleForDisplay } from '@/utils/server-auto-untitled-note-display';
import { stripHtmlForListPreview } from '@/utils/html-stripper';
import { protoRelativeCaptionAbbrev } from './proto-time';
import PrototypeDailyPassagePill from './PrototypeDailyPassagePill';

type Props = {
  homeSpaceId: string;
  notes: SpaceNoteRow[];
  notesListPhase: PrototypeNotesListPhase;
  hasMoreNotes: boolean;
  scriptureBooks: ScriptureIndexBook[];
  onOpenNote: (row: SpaceNoteRow) => void;
  prefetchNote: (row: SpaceNoteRow) => void;
  onOpenScripturePassage: (bookOrder: number) => void;
};

function HomeGreeting({
  notes,
  notesListPhase,
  hasMoreNotes,
  scriptureBooks,
  onOpenScripturePassage,
}: Pick<Props, 'notes' | 'notesListPhase' | 'hasMoreNotes' | 'scriptureBooks' | 'onOpenScripturePassage'>) {
  const { data: profile } = useProfile();
  const tagsQuery = useTagsList();

  const firstName = useMemo(() => {
    const fromProfile = profile?.firstName?.trim() || profile?.displayName?.split(' ')[0]?.trim();
    if (fromProfile && fromProfile !== 'User') return fromProfile;
    const cached = getCachedUserNames()?.firstName?.trim();
    return cached || '';
  }, [profile]);

  const topPassage = useMemo(() => deriveTopPassages(scriptureBooks, 1)[0], [scriptureBooks]);
  const topTag = useMemo(() => deriveTopTags(tagsQuery.data?.tags ?? [], 1)[0], [tagsQuery.data?.tags]);
  const streak = useMemo(() => computeActivityStreak(notes, new Date()), [notes]);

  const hello = `${greetingForHour(new Date().getHours())}${firstName ? `, ${firstName}` : ''}.`;
  const statsReady = notesListPhase === 'list';

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
  const tagChip = topTag ? (
    <span className="proto-glass-surface proto-home-greeting__chip">
      <Icon name="tag" size={10} aria-hidden />
      <span>{topTag.name}</span>
    </span>
  ) : null;
  const countChip = (
    <span className="proto-glass-surface proto-home-greeting__chip">
      <span>{formatHomeNoteCount(notes.length, hasMoreNotes)}</span>
    </span>
  );
  const streakChip = streak ? (
    <span className="proto-glass-surface proto-home-greeting__chip">
      <span>
        {streak.count} {streak.unit === 'day' ? 'days' : 'weeks'} in a row
      </span>
    </span>
  ) : null;

  return (
    <p className="proto-home-greeting">
      <span className="proto-home-greeting__hello">{hello}</span>{' '}
      {statsReady && notes.length > 0 ? (
        <>
          {passageChip ? (
            <>You keep coming back to {passageChip} lately{tagChip ? <>, and {tagChip} keeps showing up in your notes</> : null}. </>
          ) : tagChip ? (
            <>Lately, {tagChip} keeps showing up in your notes. </>
          ) : null}
          {passageChip || tagChip ? <>That&apos;s {countChip} saved so far. </> : <>You have {countChip} saved so far. </>}
          {streakChip ? <>You&apos;ve shown up {streakChip} now. Keep going.</> : <>Keep going.</>}
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
  onOpenNote,
  prefetchNote,
  onOpenScripturePassage,
}: Props) {
  const continueNote = useMemo(() => pickContinueNote(notes), [notes]);

  const continueTitle = continueNote
    ? stripServerAutoUntitledNoteTitleForDisplay(continueNote.title?.trim() ?? '') || 'New Note'
    : '';
  const continuePreview = continueNote?.content ? stripHtmlForListPreview(continueNote.content, 90) : '';
  const continueRel = continueNote
    ? protoRelativeCaptionAbbrev(continueNote.lastVisited ?? continueNote.updatedAt ?? continueNote.createdAt ?? null)
    : '';

  return (
    <div className="proto-home-view">
      <HomeGreeting
        notes={notes}
        notesListPhase={notesListPhase}
        hasMoreNotes={hasMoreNotes}
        scriptureBooks={scriptureBooks}
        onOpenScripturePassage={onOpenScripturePassage}
      />

      <PrototypeDailyPassagePill homeSpaceId={homeSpaceId} notes={notes} />

      {notesListPhase === 'empty' ? (
        <div className="proto-glass-surface proto-glass-surface--panel proto-home-card">
          <div className="proto-home-card__row">
            <span className="proto-home-card__icon-orb" aria-hidden>
              <Icon name="note-sticky" size={14} />
            </span>
            <div className="proto-home-card__body">
              <p className="pds-list-title proto-home-card__title">No notes yet</p>
              <p className="pds-list-preview proto-home-card__preview">
                Create your first note and your Home will fill in.
              </p>
            </div>
          </div>
        </div>
      ) : continueNote && notesListPhase === 'list' ? (
        <button
          type="button"
          className="proto-glass-surface proto-glass-surface--panel proto-home-card proto-home-card--tappable"
          onClick={() => onOpenNote(continueNote)}
          onMouseEnter={() => prefetchNote(continueNote)}
          onFocus={() => prefetchNote(continueNote)}
        >
          <p className="proto-caption proto-home-card__eyebrow">Pick up where you left off</p>
          <div className="proto-home-card__row">
            <span className="proto-home-card__icon-orb" aria-hidden>
              <Icon name="pen-to-square" size={14} />
            </span>
            <div className="proto-home-card__body">
              <p className="pds-list-title proto-home-card__title">{continueTitle}</p>
              {continuePreview ? (
                <p className="pds-list-preview proto-home-card__preview">{continuePreview}</p>
              ) : null}
            </div>
            <span className="proto-home-card__chevron" aria-hidden>
              <Icon name="chevron-right" size={11} />
            </span>
          </div>
          <div className="proto-home-card__chips">
            {continueRel ? <span className="proto-home-chip">{continueRel}</span> : null}
            {continueNote.primaryCollection ? (
              <span className="proto-home-chip">
                <Icon name="folder" size={10} aria-hidden />
                {continueNote.primaryCollection}
              </span>
            ) : null}
          </div>
        </button>
      ) : null}
    </div>
  );
}
