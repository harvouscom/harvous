import { useCallback, useMemo, useState } from 'react';
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
import { findScripturePassageWithNotes } from '@/utils/scripture-passage-drill';
import { getEffectiveDefaultTranslation } from '@/utils/profile-cache';
import { readerRouteForReference } from '../../utils/reader-nav';
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

  const matchingNote = useMemo(
    () => findPersistedDailyPassageNote(notes, votd.reference),
    [notes, votd.reference],
  );

  // No `&& !createNote.isPending` term any more. There is no in-flight create to hide behind:
  // compose opens the editor synchronously, so the affordance no longer flickers between
  // "add" and "view notes" while a round trip lands.
  const dailyPassageNoteExists = hasDailyPassageNote(notes, scriptureBooks, votd.reference);

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
        // The account's default, not `v.translation` — that field is whatever the VOTD API
        // happened to attach (an admin-authored fallback for automatically-picked days is
        // 'NET' regardless of who's reading), not necessarily the translation this reader
        // actually reads in.
        seed: { contentHtml: buildVotdScripturePillHtml(v.reference, getEffectiveDefaultTranslation()) },
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

  /**
   * Today's passage opens in the reader, at the verse, in the account's default translation.
   *
   * It used to open a sheet holding the verse text — which was the right answer when a
   * passage had nowhere else to go. There is a whole reader now: the chapter around the
   * verse, the margin bars showing where this passage already appears in your notes, the
   * dock, highlighting. A sheet that shows two verses and nothing else is a smaller room
   * than the one next door.
   *
   * The verse arrives as `?v=`, which is the reader's existing deep-link — the same one a
   * scripture pill uses — so it lands focused on the verse rather than at the top of the
   * chapter. An unparseable reference does nothing rather than navigating somewhere wrong.
   *
   * `getEffectiveDefaultTranslation()`, not `votd.translation` — the reader treats the URL's
   * `t=` as authoritative (so a shared link keeps the translation it was shared in), and
   * `votd.translation` is whatever the VOTD API attached, which for an automatically-picked
   * day is a fixed admin fallback ('NET') unrelated to the reader's own account setting. This
   * is the same call every other "open a passage" path in the app makes — see
   * `openPassageConnection` in `PrototypeSidebarHomeView.tsx`.
   *
   * Nothing is recorded here. `recordVotdEngagement` only knows dismiss and add-note, and
   * opening the reader is already a read: the reading session on that route logs it, with
   * the chapter and the time spent, which is more than a "viewed" ping would have said.
   */
  const openInReader = useCallback(() => {
    // `readerRouteForReference` rather than a hand-rolled route: it is the one place that
    // knows a passage can be a range, so today's passage lands on all of it.
    const route = readerRouteForReference(votd.reference, getEffectiveDefaultTranslation());
    if (!route) return;
    afterNav();
    navigate({
      ...route,
      search: {
        ...route.search,
        // Asking for today's passage again should land on the verse again, even when the
        // reader is already open on it and the verse was clicked away.
        req: String(Date.now()),
      },
    });
  }, [afterNav, navigate, votd.reference]);

  const handleDismiss = useCallback(() => {
    setVotdDismissedToday();
    setDismissedToday(true);
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
        aria-label="Read today's passage"
        onClick={openInReader}
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

    </>
  );
}
