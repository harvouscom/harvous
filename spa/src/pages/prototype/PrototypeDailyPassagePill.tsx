import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import Icon from '@/components/react/Icon';
import {
  alertCreateNoteFailure,
  useCreateSimpleNote,
} from '../../hooks/mutations/useCreateSimpleNote';
import { getNoteIdFromCreateResponse, seedNoteFromCreateResponse } from '../../hooks/queries/useNote';
import type { SpaceNoteRow } from '../../hooks/queries/useSpace';
import { useVotdToday } from '../../hooks/queries/useVotdToday';
import { useProtoShell } from '../../layouts/proto-shell-context';
import {
  isVotdPassageCardDismissedToday,
  noteMatchesDailyPassage,
  setVotdDismissedToday,
  type VotdToday,
} from '../../lib/votd-today';
import PrototypeVotdPassageSheet from './PrototypeVotdPassageSheet';
import { noteParamSlug } from './proto-route-slugs';

type Props = {
  homeSpaceId: string | null;
  notes: SpaceNoteRow[];
};

export default function PrototypeDailyPassagePill({ homeSpaceId, notes }: Props) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const createNote = useCreateSimpleNote();
  const { isMobileSidebar, closeDrawer } = useProtoShell();
  const { data: votd, isLoading } = useVotdToday({ enabled: Boolean(homeSpaceId) });
  const [dismissedToday, setDismissedToday] = useState(isVotdPassageCardDismissedToday);
  const [sheetOpen, setSheetOpen] = useState(false);

  const matchingNote = useMemo(() => {
    if (!votd) return undefined;
    return notes.find((n) => noteMatchesDailyPassage(n, votd.reference));
  }, [notes, votd]);

  const dailyPassageNoteExists = Boolean(matchingNote);

  const afterNav = useCallback(() => {
    if (isMobileSidebar) closeDrawer();
  }, [closeDrawer, isMobileSidebar]);

  const openNote = useCallback(
    (noteId: string) => {
      navigate({
        to: '/prototype/n/$noteId',
        params: { noteId: noteParamSlug(noteId) },
      });
      afterNav();
    },
    [afterNav, navigate],
  );

  const studyNow = useCallback(
    (v: VotdToday) => {
      if (!homeSpaceId) return;
      if (matchingNote) {
        openNote(matchingNote.id);
        return;
      }
      if (createNote.isPending) return;
      createNote.mutate(
        { spaceId: homeSpaceId, title: v.reference, noteType: 'scripture' },
        {
          onSuccess: (res) => {
            const nid = getNoteIdFromCreateResponse(res);
            const note = res?.note;
            if (note && typeof note === 'object' && nid) {
              try {
                seedNoteFromCreateResponse(queryClient, note as Record<string, unknown> & { id: string }, homeSpaceId);
              } catch (e) {
                console.error('[PrototypeDailyPassagePill] seedNoteFromCreateResponse:', e);
              }
            }
            if (nid) openNote(nid);
            else alert('Create succeeded but response had no note id.');
          },
          onError: (err) => {
            alertCreateNoteFailure(err);
          },
        },
      );
    },
    [createNote, homeSpaceId, matchingNote, openNote, queryClient],
  );

  const handleDismiss = () => {
    setVotdDismissedToday();
    setDismissedToday(true);
  };

  if (!homeSpaceId || isLoading || !votd || dismissedToday) {
    return null;
  }

  return (
    <div className="proto-sidebar-daily-passage">
      <div className="proto-daily-passage-pill">
        <button
          type="button"
          className="proto-daily-passage-pill__dismiss"
          aria-label="Dismiss today's passage"
          onClick={handleDismiss}
        >
          <Icon name="xmark" size={10} aria-hidden />
          <span>Dismiss</span>
        </button>

        <div
          className={`proto-daily-passage-pill__content${dailyPassageNoteExists ? ' proto-daily-passage-pill__content--no-add' : ''}`}
        >
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
          {!dailyPassageNoteExists ? (
            <button
              type="button"
              className="proto-daily-passage-pill__orb"
              aria-label="Add passage to notes"
              disabled={createNote.isPending}
              onClick={() => studyNow(votd)}
            >
              <Icon name="plus" size={12} />
            </button>
          ) : null}
        </div>
      </div>

      <PrototypeVotdPassageSheet
        votd={votd}
        open={sheetOpen}
        showsAddFAB={!dailyPassageNoteExists}
        onClose={() => setSheetOpen(false)}
        onAdd={() => {
          setSheetOpen(false);
          studyNow(votd);
        }}
      />
    </div>
  );
}
