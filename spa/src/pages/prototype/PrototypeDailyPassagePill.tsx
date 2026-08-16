import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { prototypeHomeRouteTo, prototypeNoteRouteTo } from '@/lib/prototype-path';
import { useQueryClient } from '@tanstack/react-query';
import PrototypeHomeRow from './PrototypeHomeRow';
import Icon from '@/components/react/Icon';
import type { SpaceNoteRow } from '../../hooks/queries/useSpace';
import type { ScriptureIndexBook } from '../../hooks/queries/usePrototypeSpaceScriptureIndex';
import { useProtoShell } from '../../layouts/proto-shell-context';
import {
  findPersistedDailyPassageNote,
  hasDailyPassageNote,
  isVotdPassageCardDismissedToday,
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

export default function PrototypeDailyPassagePill({
  homeSpaceId,
  notes,
  votd,
  scriptureBooks,
  onOpenScripturePassage,
}: Props) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isMobileSidebar, closeDrawer, beginPrototypeComposeSession } = useProtoShell();
  const [dismissedToday, setDismissedToday] = useState(isVotdPassageCardDismissedToday);
  const [sheetOpen, setSheetOpen] = useState(false);

  const matchingNote = useMemo(
    () => findPersistedDailyPassageNote(notes, votd.reference),
    [notes, votd.reference],
  );

  // No `&& !createNote.isPending` term any more. There is no in-flight create to hide behind:
  // compose opens the editor synchronously, so the affordance no longer flickers between
  // "add" and "view notes" while a round trip lands.
  const dailyPassageNoteExists = hasDailyPassageNote(notes, scriptureBooks, votd.reference);

  useEffect(() => {
    void fetchVerseHtml(votd.reference, votd.translation);
  }, [votd.reference, votd.translation]);

  const afterNav = useCallback(() => {
    if (isMobileSidebar) closeDrawer({ preserveHistory: true });
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

  /**
   * Opens the editor on the passage immediately.
   *
   * This used to `createNote.mutate` and wait for `onSuccess` to learn a note id before it
   * could navigate — so the tap disabled the button and then sat there for a full round trip,
   * which on a phone is most of a second of nothing happening. The compose session is
   * synchronous: seed it with the passage, land on the editor, and let `persistDraftNote`
   * create the row in the background. Same path the "New note" button has always used.
   */
  const studyNow = useCallback(
    (v: VotdToday) => {
      if (!homeSpaceId) return;
      const persisted = findPersistedDailyPassageNote(notes, v.reference);
      if (persisted) {
        openNote(persisted.id);
        return;
      }
      recordVotdEngagement('add_note');
      invalidateScriptureIndex();
      beginPrototypeComposeSession({
        targetSpaceId: homeSpaceId,
        seed: { contentHtml: buildVotdScripturePillHtml(v.reference, v.translation) },
      });
      afterNav();
      navigate({ to: prototypeHomeRouteTo() });
    },
    [
      afterNav,
      beginPrototypeComposeSession,
      homeSpaceId,
      invalidateScriptureIndex,
      navigate,
      notes,
      openNote,
    ],
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
      {/* A row of the Suggested group. Tapping the row opens the passage; the trailing
          controls are the one action worth a button — add it to notes, or open the notes
          it already has — and the dismiss. Same shape as every other row on Home. */}
      <PrototypeHomeRow
        icon="scroll"
        title={votd.reference}
        meta={["Today\u2019s passage"]}
        aria-label="View today's passage"
        onClick={() => setSheetOpen(true)}
        trailing={
          <>
            {dailyPassageNoteExists ? (
              <button
                type="button"
                className="proto-side-panel__action-btn"
                aria-label="View notes on this passage"
                onClick={openScripturePassageNotes}
              >
                <Icon name="list" size={12} aria-hidden />
              </button>
            ) : (
              <button
                type="button"
                className="proto-side-panel__action-btn"
                aria-label="Add passage to notes"
                onClick={() => studyNow(votd)}
              >
                <Icon name="plus" size={12} aria-hidden />
              </button>
            )}
            <button
              type="button"
              className="proto-side-panel__action-btn"
              aria-label="Dismiss today's passage"
              onClick={handleDismiss}
            >
              <Icon name="xmark" size={12} aria-hidden />
            </button>
          </>
        }
      />

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
