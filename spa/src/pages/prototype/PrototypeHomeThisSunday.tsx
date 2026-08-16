/**
 * Home › "This Sunday" — the church's next service, and one tap into notes on it.
 *
 * This is the congregant half of the teaching plan. The church row is **one**
 * service, never a calendar: `docs/future/MY_CHURCH_SIDEBAR.md` locks the sermon
 * calendar as a pastor tool, "not a calendar widget". A congregant gets the
 * appointment, not the schedule.
 *
 * **Amended Aug 2026 (§5): the church row, plus a row per context you belong
 * to.** Each still shows exactly one service — the doctrine was "one service per
 * card, never a list", and that holds. What changed is that a ministry you
 * follow now reports its *own* next gathering rather than competing for the
 * church's slot. An earlier draft had one card drawn from a widened source set
 * with the church winning ties; that made a channel you follow *take* something
 * from you, and invented a competition the product does not have.
 *
 * Renders nothing at all when the viewer has no home church or their church has
 * no plan, so it never occupies Home for the majority of users who aren't
 * connected to a church — same discipline as PrototypeHomeChurchFeed.
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
  formatServiceTime,
  formatServiceTimes,
  selectHomeCards,
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

  /*
    One selection pass for every source. `currentSermonFor` is unchanged and
    runs once per group; the context window is applied only to context rows,
    never to the church's — it is the anchor.
  */
  const { church, contexts } = useMemo(
    () =>
      data?.connected
        ? selectHomeCards(data.services, undefined, data.churchNow ?? null)
        : { church: null, contexts: [] },
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
      const folder = starterFolderForSermon(svc);

      // Opens the editor now and creates the row behind it — the seed rides into
      // `persistDraftNote` rather than blocking on a create round trip.
      //
      // `startedFromServiceId` is this row's own service, so lineage works per
      // context with no special casing: a Youth row starts a Youth-lineage note.
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

  /*
    One service as rows: the service itself, then whatever ministries published
    *for* it.

    CHURCH_STUDY_MATERIAL_LINKING.md required that attached material have "a
    real home in the card, not be a sibling of it" — written when This Sunday
    was a single card and the old pointer left an orphaned line floating between
    two cards. Home is hairline-separated rows in one panel now, so the rows
    below *are* the containment that constraint was asking for: they sit inside
    the same panel, directly under the service they belong to. The letter of the
    rule moved; what it was protecting did not.

    Zero attached is the common case and adds no rows at all.
  */
  const serviceRows = useCallback(
    (service: ChurchSermon, contextTitle?: string) => {
      const eyebrow = sermonEyebrow(service);
      const hasNote = Boolean(service.viewerNoteId);
      /* A context row carries the single resolved reading; the church row keeps
         `serviceTimes`, which can legitimately hold both morning services. */
      const timeLabel = contextTitle
        ? formatServiceTime(service.serviceTime ?? null)
        : formatServiceTimes(service.serviceTimes);

      return [
        <PrototypeHomeRow
          key={service.id}
          /* A plain glyph, never the space's coloured tile — `iconNode` is
             exactly the affordance the do-not forbids here, because a colour
             would claim the sermon came *from* that room. A context is named in
             words instead, where the eyebrow now lives. */
          icon={contextTitle ? 'user-group' : 'church'}
          title={service.title}
          meta={[
            contextTitle ? `${eyebrow} · ${contextTitle}` : `${eyebrow}’s sermon`,
            timeLabel,
            service.seriesTitle,
          ]}
          aria-label={hasNote ? 'Open my note on this service' : 'New note on this service'}
          disabled={!homeSpaceId && !hasNote}
          onClick={() => takeNotes(service)}
        />,
        ...(service.attached ?? []).map((item) => (
          <PrototypeHomeRow
            key={`${service.id}:${item.noteId}`}
            icon="rss"
            title={item.title}
            /* The room named in words, for the same reason as above. */
            meta={['Study material', item.channelTitle]}
            onClick={() => openNote(item.noteId)}
          />
        )),
      ];
    },
    [homeSpaceId, openNote, takeNotes],
  );

  if (!data?.connected) return null;
  if (!church && contexts.length === 0) return null;

  return (
    <>
      {/* Church first, always — it is the anchor and it stays first. */}
      {church ? serviceRows(church) : null}
      {contexts.map(({ source, service }) => serviceRows(service, source.title))}
    </>
  );
}
