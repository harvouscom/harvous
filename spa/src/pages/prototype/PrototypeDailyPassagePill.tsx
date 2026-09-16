import { useCallback, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { prototypeHomeRouteTo, prototypeNoteRouteTo } from '@/lib/prototype-path';
import { useQueryClient } from '@tanstack/react-query';
import PrototypeHomeRow from './PrototypeHomeRow';
import Icon from '@/components/react/Icon';
import type { SpaceNoteRow } from '../../hooks/queries/useSpace';
import { useProtoShell } from '../../layouts/proto-shell-context';
import {
  findPersistedDailyPassageNote,
  isVotdPassageCardDismissedToday,
  recordVotdEngagement,
  setVotdDismissedToday,
  shouldForceShowTodaysPassage,
  clearForcedTodaysPassage,
  type VotdToday,
} from '../../lib/votd-today';
import { buildVotdScripturePillHtml } from '../../lib/votd-scripture-pill-html';
import { normalizePrototypeApiSpaceId } from '../../utils/prototype-space-api-id';
import { getEffectiveDefaultTranslation } from '@/utils/profile-cache';
import { landAgain, readerRouteForReference } from '../../utils/reader-nav';
import { noteParamSlug } from './proto-route-slugs';

type Props = {
  homeSpaceId: string | null;
  notes: SpaceNoteRow[];
  votd: VotdToday;
};

export default function PrototypeDailyPassagePill({
  homeSpaceId,
  notes,
  votd,
}: Props) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isMobileSidebar, closeDrawer, beginPrototypeComposeSession } = useProtoShell();
  const [dismissedToday, setDismissedToday] = useState(isVotdPassageCardDismissedToday);

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

  const openInReader = useCallback(() => {
    const route = readerRouteForReference(votd.reference, getEffectiveDefaultTranslation());
    if (!route) return;
    afterNav();
    navigate(landAgain(route));
  }, [afterNav, navigate, votd.reference]);

  const handleDismiss = useCallback(() => {
    clearForcedTodaysPassage();
    setVotdDismissedToday();
    setDismissedToday(true);
    recordVotdEngagement('dismiss');
  }, []);

  if (!homeSpaceId || (dismissedToday && !shouldForceShowTodaysPassage())) {
    return null;
  }

  return (
    <>
      <div id="todays-passage">
      <PrototypeHomeRow
        icon="scroll"
        title={votd.reference}
        meta={["Today\u2019s passage"]}
        aria-label="Read today's passage"
        onClick={openInReader}
        trailing={
          <>
            <button
              type="button"
              className="proto-side-panel__action-btn"
              aria-label="Add passage to notes"
              title="Add passage to notes"
              onClick={() => studyNow(votd)}
            >
              <Icon name="pen-to-square" size={12} aria-hidden />
            </button>
            <button
              type="button"
              className="proto-side-panel__action-btn"
              aria-label="Dismiss today's passage"
              title="Not today"
              onClick={handleDismiss}
            >
              <Icon name="xmark" size={12} aria-hidden />
            </button>
          </>
        }
      />
      </div>
    </>
  );
}
