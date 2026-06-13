import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { prototypeNoteRouteTo } from '@/lib/prototype-path';
import { useQueryClient } from '@tanstack/react-query';
import Icon from '@/components/react/Icon';
import {
  alertCreateNoteFailure,
  useCreateSimpleNote,
} from '../../hooks/mutations/useCreateSimpleNote';
import { getNoteIdFromCreateResponse, seedNoteFromCreateResponse } from '../../hooks/queries/useNote';
import type { SpaceNoteRow } from '../../hooks/queries/useSpace';
import { useProtoShell } from '../../layouts/proto-shell-context';
import { noteMatchesDailyPassage, type VotdToday } from '../../lib/votd-today';
import { buildVotdScripturePillHtml } from '../../lib/votd-scripture-pill-html';
import PrototypeVotdPassageSheet from './PrototypeVotdPassageSheet';
import { noteParamSlug } from './proto-route-slugs';

type Props = {
  homeSpaceId: string | null;
  notes: SpaceNoteRow[];
  votd: VotdToday;
};

export default function PrototypeDailyPassagePill({ homeSpaceId, notes, votd }: Props) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const createNote = useCreateSimpleNote();
  const { isMobileSidebar, closeDrawer } = useProtoShell();
  const [sheetOpen, setSheetOpen] = useState(false);

  const matchingNote = useMemo(() => {
    return notes.find((n) => noteMatchesDailyPassage(n, votd.reference));
  }, [notes, votd.reference]);

  const dailyPassageNoteExists = Boolean(matchingNote);

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

  const studyNow = useCallback(
    (v: VotdToday) => {
      if (!homeSpaceId) return;
      if (matchingNote) {
        openNote(matchingNote.id);
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

  if (!homeSpaceId) {
    return null;
  }

  return (
    <>
      <div className="proto-daily-passage-pill proto-daily-passage-pill--home">
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
    </>
  );
}
