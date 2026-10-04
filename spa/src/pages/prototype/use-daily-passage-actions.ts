/**
 * What you can do with today's passage, shared by its two shapes.
 *
 * The card at the top of Activity (words, two labelled buttons) and the row in Suggested it
 * folds down to are the same offer at two sizes, so they share one set of actions — opening
 * the reader, writing about it, "Not today" — and one idea of what has already happened.
 * Pulled out of `PrototypeDailyPassagePill`, where it all used to live.
 */
import { useCallback, useState, useSyncExternalStore } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useAuth } from '@clerk/clerk-react';
import { useQueryClient } from '@tanstack/react-query';
import { prototypeHomeRouteTo, prototypeNoteRouteTo } from '@/lib/prototype-path';
import type { SpaceNoteRow } from '../../hooks/queries/useSpace';
import { votdTodayQueryKey } from '../../hooks/queries/useVotdToday';
import { useProtoShell } from '../../layouts/proto-shell-context';
import {
  clearForcedTodaysPassage,
  findPersistedDailyPassageNote,
  isVotdPassageCardDismissedToday,
  recordVotdEngagement,
  setVotdDismissedToday,
  shouldForceShowTodaysPassage,
  subscribeForcedTodaysPassage,
  type VotdToday,
} from '../../lib/votd-today';
import { buildScripturePillWithQuoteHtml } from '../../lib/votd-scripture-pill-html';
import { verseHtmlToPeekText } from '@/utils/verse-peek';
import { normalizePrototypeApiSpaceId } from '../../utils/prototype-space-api-id';
import { getEffectiveDefaultTranslation } from '@/utils/profile-cache';
import { landAgain, readerRouteForReference } from '../../utils/reader-nav';
import { noteParamSlug } from './proto-route-slugs';

export function useDailyPassageActions({
  homeSpaceId,
  notes,
  votd,
}: {
  homeSpaceId: string | null;
  notes: SpaceNoteRow[];
  votd: VotdToday;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { userId } = useAuth();
  const { isMobileSidebar, closeDrawer, beginPrototypeComposeSession } = useProtoShell();
  const [dismissedToday, setDismissedToday] = useState(() => isVotdPassageCardDismissedToday(userId));
  /*
   * Subscribed, not read during render. A reminder tap sets this at the end of a promise chain
   * that can land well after this has already mounted and decided to render nothing — and with
   * the dismissal frozen in `useState`, nothing would ever ask again. This is the whole reason
   * "we fixed it and the passage still is not there" kept coming back.
   */
  const forceShow = useSyncExternalStore(
    subscribeForcedTodaysPassage,
    shouldForceShowTodaysPassage,
    () => false,
  );

  /** A note on this passage started today, if there is one — "Create note" opens it instead. */
  const todaysNote = findPersistedDailyPassageNote(notes, votd.reference);

  const afterNav = useCallback(() => {
    if (isMobileSidebar) closeDrawer({ preserveHistory: true });
  }, [closeDrawer, isMobileSidebar]);

  /*
   * Fold the card now, in this cache; the server already knows (`open_reader` / `add_note`,
   * or the note create itself), so every other device folds it on its next fetch.
   */
  const markActed = useCallback(() => {
    queryClient.setQueryData<VotdToday | null>(votdTodayQueryKey, (current) =>
      current ? { ...current, actedToday: true } : current,
    );
  }, [queryClient]);

  const openInReader = useCallback(() => {
    const route = readerRouteForReference(votd.reference, getEffectiveDefaultTranslation());
    if (!route) return;
    recordVotdEngagement('open_reader');
    markActed();
    afterNav();
    navigate(landAgain(route));
  }, [afterNav, markActed, navigate, votd.reference]);

  const takeNote = useCallback(() => {
    if (!homeSpaceId) return;
    markActed();
    if (todaysNote) {
      navigate({ to: prototypeNoteRouteTo(), params: { noteId: noteParamSlug(todaysNote.id) } });
      afterNav();
      return;
    }
    recordVotdEngagement('add_note');
    const id = normalizePrototypeApiSpaceId(homeSpaceId);
    if (id) {
      void queryClient.invalidateQueries({ queryKey: ['prototype', 'space', id, 'scripture-index'] });
    }
    /*
     * The pill and, under it, the words the card was showing — the same pair the reader seeds
     * when you write about a verse. The words are already in the reader's own translation
     * (`/api/votd/today` resolves it per member), so the pill takes that translation too, or
     * the two would disagree. No words (signed out, fetch failed) → the pill alone, as before.
     */
    const words = verseHtmlToPeekText(votd.textHtml ?? '');
    const translation = words ? votd.translation : getEffectiveDefaultTranslation();
    beginPrototypeComposeSession({
      targetSpaceId: homeSpaceId,
      seed: {
        contentHtml: buildScripturePillWithQuoteHtml(
          votd.reference,
          translation,
          words ? { reference: votd.reference, text: words } : null,
        ),
      },
    });
    afterNav();
    navigate({ to: prototypeHomeRouteTo() });
  }, [
    afterNav,
    beginPrototypeComposeSession,
    homeSpaceId,
    markActed,
    navigate,
    queryClient,
    todaysNote,
    votd.reference,
    votd.textHtml,
    votd.translation,
  ]);

  const dismiss = useCallback(() => {
    clearForcedTodaysPassage();
    setVotdDismissedToday(userId);
    setDismissedToday(true);
    recordVotdEngagement('dismiss');
  }, [userId]);

  return {
    /** Hidden for the rest of today — unless a reminder link asked to see it. */
    hidden: dismissedToday && !forceShow,
    todaysNote,
    openInReader,
    takeNote,
    dismiss,
  };
}
