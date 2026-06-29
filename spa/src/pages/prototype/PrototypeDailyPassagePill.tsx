import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { prototypeNoteRouteTo } from '@/lib/prototype-path';
import { useQueryClient } from '@tanstack/react-query';
import Icon from '@/components/react/Icon';
import {
  alertCreateNoteFailure,
  useCreateSimpleNote,
} from '../../hooks/mutations/useCreateSimpleNote';
import { getNoteIdFromCreateResponse } from '../../hooks/queries/useNote';
import type { SpaceNoteRow } from '../../hooks/queries/useSpace';
import type { ScriptureIndexBook } from '../../hooks/queries/usePrototypeSpaceScriptureIndex';
import { useProtoShell } from '../../layouts/proto-shell-context';
import {
  findPersistedDailyPassageNote,
  hasDailyPassageNote,
  isVotdPassageCardDismissedToday,
  noteMatchesDailyPassage,
  recordVotdEngagement,
  setVotdDismissedToday,
  type VotdToday,
} from '../../lib/votd-today';
import { buildVotdScripturePillHtml } from '../../lib/votd-scripture-pill-html';
import { normalizePrototypeApiSpaceId } from '../../utils/prototype-space-api-id';
import { fetchVerseHtml } from '@/utils/fetch-verse-html';
import { findScripturePassageWithNotes } from '@/utils/scripture-passage-drill';
import PrototypeVotdPassageSheet from './PrototypeVotdPassageSheet';
import { noteParamSlug } from './proto-route-slugs';

type Props = {
  homeSpaceId: string | null;
  notes: SpaceNoteRow[];
  votd: VotdToday;
  scriptureBooks: ScriptureIndexBook[];
  onOpenScripturePassage: (bookOrder: number, passageKey: string) => void;
};

function isOfflineQueuedCreate(res: unknown): boolean {
  return Boolean(res && typeof res === 'object' && 'offlineQueued' in res && (res as { offlineQueued: boolean }).offlineQueued);
}

export default function PrototypeDailyPassagePill({
  homeSpaceId,
  notes,
  votd,
  scriptureBooks,
  onOpenScripturePassage,
}: Props) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const createNote = useCreateSimpleNote();
  const { isMobileSidebar, closeDrawer } = useProtoShell();
  const [dismissedToday, setDismissedToday] = useState(isVotdPassageCardDismissedToday);
  const [sheetOpen, setSheetOpen] = useState(false);

  const matchingNote = useMemo(
    () => findPersistedDailyPassageNote(notes, votd.reference),
    [notes, votd.reference],
  );

  const dailyPassageNoteExists =
    hasDailyPassageNote(notes, scriptureBooks, votd.reference) && !createNote.isPending;

  useEffect(() => {
    void fetchVerseHtml(votd.reference, votd.translation);
  }, [votd.reference, votd.translation]);

  const afterNav = useCallback(() => {
    if (isMobileSidebar) closeDrawer();
  }, [closeDrawer, isMobileSidebar]);

  const openNote = useCallback(
    (noteId: string) => {
      navigate({
        to: prototypeNoteRouteTo(),
        params: { noteId: noteParamSlug(noteId) },
      });
      afterNav();
    },
    [afterNav, navigate],
  );

  const invalidateScriptureIndex = useCallback(() => {
    const id = normalizePrototypeApiSpaceId(homeSpaceId ?? undefined);
    if (id) {
      void queryClient.invalidateQueries({ queryKey: ['prototype', 'space', id, 'scripture-index'] });
    }
  }, [homeSpaceId, queryClient]);

  const openScripturePassageNotes = useCallback(() => {
    const drill = findScripturePassageWithNotes(scriptureBooks, votd.reference);
    if (drill) {
      onOpenScripturePassage(drill.bookOrder, drill.passageKey);
      afterNav();
      return;
    }
    if (matchingNote) {
      openNote(matchingNote.id);
    }
  }, [afterNav, matchingNote, onOpenScripturePassage, openNote, scriptureBooks, votd.reference]);

  const studyNow = useCallback(
    (v: VotdToday) => {
      if (!homeSpaceId) return;
      const persisted = findPersistedDailyPassageNote(notes, v.reference);
      if (persisted) {
        openNote(persisted.id);
        return;
      }
      if (createNote.isPending) return;
      createNote.mutate(
        {
          spaceId: homeSpaceId,
          title: '',
          content: buildVotdScripturePillHtml(v.reference, v.translation),
          noteType: 'default',
        },
        {
          onSuccess: (res) => {
            if (isOfflineQueuedCreate(res)) {
              const optimistic = notes.find(
                (n) => n.id.startsWith('local_') && noteMatchesDailyPassage(n, v.reference),
              );
              if (optimistic) openNote(optimistic.id);
              return;
            }
            recordVotdEngagement('add_note');
            invalidateScriptureIndex();
            const nid = getNoteIdFromCreateResponse(res);
            if (nid) openNote(nid);
            else alert('Create succeeded but response had no note id.');
          },
          onError: (err) => {
            alertCreateNoteFailure(err);
          },
        },
      );
    },
    [createNote, homeSpaceId, invalidateScriptureIndex, notes, openNote],
  );

  const handleDismiss = useCallback(() => {
    setVotdDismissedToday();
    setDismissedToday(true);
    setSheetOpen(false);
    recordVotdEngagement('dismiss');
  }, []);

  if (!homeSpaceId || dismissedToday) {
    return null;
  }

  return (
    <>
      <div className="proto-daily-passage-pill proto-daily-passage-pill--home">
        <button
          type="button"
          className="proto-daily-passage-pill__dismiss"
          aria-label="Dismiss today's passage"
          onClick={handleDismiss}
        >
          <Icon name="xmark" size={10} aria-hidden />
          <span>Dismiss</span>
        </button>

        <div className="proto-daily-passage-pill__content">
          <p className="proto-caption proto-daily-passage-pill__eyebrow">Today&apos;s Passage</p>
          <p className="pds-list-title proto-daily-passage-pill__reference">{votd.reference}</p>
        </div>

        <div className="proto-daily-passage-pill__orbs">
          <button
            type="button"
            className="proto-daily-passage-pill__orb"
            aria-label="View today's passage"
            onClick={() => setSheetOpen(true)}
          >
            <Icon name="book-open" size={12} />
          </button>
          {dailyPassageNoteExists ? (
            <button
              type="button"
              className="proto-daily-passage-pill__orb"
              aria-label="View notes on this passage"
              onClick={openScripturePassageNotes}
            >
              <Icon name="list" size={12} />
            </button>
          ) : (
            <button
              type="button"
              className="proto-daily-passage-pill__orb"
              aria-label="Add passage to notes"
              disabled={createNote.isPending}
              onClick={() => studyNow(votd)}
            >
              <Icon name="plus" size={12} />
            </button>
          )}
        </div>
      </div>

      <PrototypeVotdPassageSheet
        votd={votd}
        open={sheetOpen}
        showsAddFAB={!dailyPassageNoteExists && !createNote.isPending}
        onClose={() => setSheetOpen(false)}
        onAdd={() => {
          setSheetOpen(false);
          studyNow(votd);
        }}
      />
    </>
  );
}
