/**
 * Home › "This Sunday" — the church's next service, and one tap into notes on it.
 *
 * This is the congregant half of the teaching plan. Deliberately ONE service,
 * never a calendar: `docs/future/MY_CHURCH_SIDEBAR.md` locks the sermon
 * calendar as a pastor tool, "not a calendar widget". A congregant gets the
 * appointment, not the schedule.
 *
 * Renders nothing at all when the viewer has no home church or their church has
 * no plan, so it never occupies Home for the majority of users who aren't
 * connected to a church — same discipline as PrototypeHomeChurchFeed.
 *
 * Sits ABOVE the daily passage pill: the church's passage is an appointment,
 * the verse of the day is a habit, and on a Saturday the appointment wins.
 *
 * Design reference: church gallery scene `09-broadcast-note`.
 */
import { useCallback, useMemo } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { prototypeHomeRouteTo, prototypeNoteRouteTo } from '@/lib/prototype-path';
import PrototypeHomeRow from './PrototypeHomeRow';
import { getEffectiveDefaultTranslation } from '@/utils/profile-cache';
import { useChurchSermons } from '../../hooks/queries/useChurchSermons';
import {
  buildStarterContent,
  currentSermonFor,
  formatServiceTimes,
  sermonEyebrow,
  starterFolderForSermon,
  starterNoteTitle,
  type ChurchSermon,
} from '../../lib/church-services';
import { useProtoShell } from '../../layouts/proto-shell-context';
import { noteParamSlug } from './proto-route-slugs';

type Props = {
  homeSpaceId: string | null;
};

export default function PrototypeHomeThisSunday({ homeSpaceId }: Props) {
  const navigate = useNavigate();
  const { isMobileSidebar, closeDrawer, beginPrototypeComposeSession } = useProtoShell();
  const { data } = useChurchSermons();

  const service = useMemo(
    () => (data?.connected ? currentSermonFor(data.services, undefined, data.churchNow ?? null) : null),
    [data],
  );

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

  const takeNotes = useCallback(
    (svc: ChurchSermon) => {
      // Already wrote something for this service — open it rather than making
      // a second one. The server resolved this from the viewer's own note row.
      if (svc.viewerNoteId) {
        openNote(svc.viewerNoteId);
        return;
      }
      if (!homeSpaceId) return;

      // Series → folder, so eight weeks of one study land together instead of
      // scattering across whatever each week's text happened to be about.
      // Set at create time on purpose: the create route takes folder fields
      // precisely so a caller doesn't follow a create with a second write,
      // which is what used to make a fresh note 409 its own first autosave.
      const folder = starterFolderForSermon(svc);

      // Opens the editor now and creates the row behind it. This was the slowest of the
      // "add" affordances to react, because it awaited a create that also had to resolve the
      // series folder and both provenance ids before it knew a note id to navigate to — so
      // the button disabled itself and nothing moved until the whole round trip landed. All
      // of that now rides the seed into `persistDraftNote`.
      beginPrototypeComposeSession({
        targetSpaceId: homeSpaceId,
        seed: {
          title: starterNoteTitle(svc),
          contentHtml: buildStarterContent(svc, getEffectiveDefaultTranslation()),
          startedFromServiceId: svc.id,
          startedFromServiceTitle: svc.title,
          ...(folder
            ? {
                primaryCollection: folder,
                // "Chosen, not guessed" — whoever planned the series named this
                // grouping. Also what stops the auto-folder pass overwriting it.
                collectionUserOverride: true,
              }
            : {}),
          ...(svc.starter
            ? {
                startedFromTemplateId: svc.starter.templateId,
                startedFromTemplateName: svc.starter.templateName,
              }
            : {}),
        },
      });
      afterNav();
      navigate({ to: prototypeHomeRouteTo() });
    },
    [afterNav, beginPrototypeComposeSession, homeSpaceId, navigate, openNote],
  );

  if (!data?.connected || !service) return null;

  const eyebrow = sermonEyebrow(service);
  const timeLabel = formatServiceTimes(service.serviceTimes);
  const hasNote = Boolean(service.viewerNoteId);

  return (
    /*
      One row of whichever Home group holds it — no wrapper of its own, so it sits between
      the other rows in the panel with a hairline, not as a card in a list of cards. What
      used to be the eyebrow leads the meta line: the day is the framing, the time and the
      series are the rest of "when".

      Deliberately no coloured space tile: a plain glyph says "church" without claiming
      the sermon came from any particular room.
    */
    <PrototypeHomeRow
      icon="church"
      title={service.title}
      meta={[`${eyebrow}\u2019s sermon`, timeLabel, service.seriesTitle]}
      aria-label={hasNote ? 'Open my note on this service' : 'New note on this service'}
      disabled={!homeSpaceId && !hasNote}
      onClick={() => takeNotes(service)}
    />
  );
}
