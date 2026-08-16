/**
 * Home › "This Sunday" — the church's next service, and one tap into notes on it.
 *
 * This is the congregant half of the teaching plan. The church card is **one**
 * service, never a calendar: `docs/future/MY_CHURCH_SIDEBAR.md` locks the sermon
 * calendar as a pastor tool, "not a calendar widget". A congregant gets the
 * appointment, not the schedule.
 *
 * **Amended Aug 2026 (§5): the church card, plus a card per context you belong
 * to.** Each still shows exactly one service — the doctrine was "one service per
 * card, never a list", and that holds. What changed is that a ministry you
 * follow now gets its *own* card rather than competing for the church's slot. An
 * earlier draft had one card drawn from a widened source set with the church
 * winning ties; that made a channel you follow *take* something from you, and
 * invented a competition the product does not have.
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
import Icon from '@/components/react/Icon';
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

type CardProps = {
  service: ChurchSermon;
  /** The room reporting this, for a context card. Absent = the church's own. */
  contextTitle?: string;
  homeSpaceId: string | null;
  onOpenNote: (noteId: string) => void;
  onTakeNotes: (service: ChurchSermon) => void;
};

/**
 * One card: an eyebrow, the service, and whatever was published for it.
 *
 * Shared by the church card and every context card so they cannot drift on
 * anatomy. What differs is the eyebrow (a context names itself) and one
 * subordinate modifier — a room you're in reporting its next thing is not a
 * second appointment competing for the same status.
 *
 * **Never tinted by the room's colour**, for either kind. Settled for companion
 * channels in CHURCH_STUDY_MATERIAL_LINKING.md: a colour would say the sermon
 * came *from* that room.
 */
function SermonCard({ service, contextTitle, homeSpaceId, onOpenNote, onTakeNotes }: CardProps) {
  const eyebrow = sermonEyebrow(service);
  const hasNote = Boolean(service.viewerNoteId);
  const attached = service.attached ?? [];
  /* A context card carries the single resolved reading; the church card keeps
     `serviceTimes`, which can legitimately hold both morning services. */
  const timeLabel = contextTitle
    ? formatServiceTime(service.serviceTime ?? null)
    : formatServiceTimes(service.serviceTimes);

  return (
    <div className="proto-home-section">
      {/*
        The card is a *container* whose first region is the tap target, not one
        big <button>. It was the latter until study material had somewhere to
        go — and a button cannot contain buttons, which is why the pointer this
        replaces ended up rendering an orphaned line between two cards.
      */}
      <div
        className={`proto-glass-surface proto-glass-surface--panel proto-home-card proto-home-card--split proto-this-sunday${
          contextTitle ? ' proto-this-sunday--context' : ''
        }`}
      >
        <button
          type="button"
          className="proto-this-sunday__main proto-home-card--tappable"
          aria-label={hasNote ? 'Open my note on this service' : 'New note on this service'}
          disabled={!homeSpaceId && !hasNote}
          onClick={() => onTakeNotes(service)}
        >
          {/* A context names itself in the eyebrow — "This Wednesday · Youth" —
              so the card says whose gathering it is without a coloured tile. */}
          <p className="proto-caption proto-home-card__eyebrow">
            {contextTitle ? `${eyebrow} · ${contextTitle}` : `${eyebrow}’s sermon`}
          </p>
          <div className="proto-home-card__body">
            <div className="proto-home-card__title-row">
              <span className="proto-home-card__icon-orb" aria-hidden>
                <Icon name={contextTitle ? 'user-group' : 'church'} size={13} />
              </span>
              <p className="pds-list-title proto-home-card__title">{service.title}</p>
              <span className="proto-home-card__chevron" aria-hidden>
                <Icon name="caret-right" size={11} />
              </span>
            </div>
            {/*
              Time first, series second: the eyebrow already carries the day, so
              the missing half of "when" is the clock. Rendered as the church's own
              wall time, resolved server-side and never converted to the viewer's
              zone. A church that has set no time renders exactly as before.
            */}
            {timeLabel || service.seriesTitle ? (
              <div className="proto-home-card__meta">
                {timeLabel ? <span className="proto-home-card__meta-item">{timeLabel}</span> : null}
                {timeLabel && service.seriesTitle ? (
                  <span className="proto-home-card__meta-sep">·</span>
                ) : null}
                {service.seriesTitle ? (
                  <span className="proto-home-card__meta-item">{service.seriesTitle}</span>
                ) : null}
              </div>
            ) : null}
          </div>
        </button>

        {/*
          What the church's ministries published for this service. A list, not a
          button — several ministries can speak to the same Sunday, which is the
          argument the removed single pointer lost.

          Zero attached is the common case and renders nothing at all: no
          heading, no divider, no empty state.
        */}
        {attached.length > 0 ? (
          <div className="proto-this-sunday__attached">
            <p className="proto-caption proto-this-sunday__attached-label">Study material</p>
            <ul className="proto-this-sunday__attached-list">
              {attached.map((item) => (
                <li key={item.noteId}>
                  <button
                    type="button"
                    className="proto-this-sunday__attached-item"
                    onClick={() => onOpenNote(item.noteId)}
                  >
                    <span className="proto-this-sunday__attached-title">{item.title}</span>
                    <span className="proto-caption proto-this-sunday__attached-from">
                      {item.channelTitle}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function PrototypeHomeThisSunday({ homeSpaceId }: Props) {
  const navigate = useNavigate();
  const { isMobileSidebar, closeDrawer, beginPrototypeComposeSession } = useProtoShell();
  const { data } = useChurchSermons();

  /*
    One selection pass for every source. `currentSermonFor` is unchanged and
    runs once per group; the context window is applied only to context cards,
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
      // Set at create time on purpose: the create route takes folder fields
      // precisely so a caller doesn't follow a create with a second write,
      // which is what used to make a fresh note 409 its own first autosave.
      const folder = starterFolderForSermon(svc);

      // Opens the editor now and creates the row behind it. This was the slowest of the
      // "add" affordances to react, because it awaited a create that also had to resolve the
      // series folder and both provenance ids before it knew a note id to navigate to — so
      // the button disabled itself and nothing moved until the whole round trip landed. All
      // of that now rides the seed into `persistDraftNote`.
      //
      // `startedFromServiceId` is this card's own service, so lineage works per
      // context with no special casing — a Youth card starts a Youth-lineage note.
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

  if (!data?.connected) return null;
  if (!church && contexts.length === 0) return null;

  return (
    <>
      {/* Church first, always — it is the anchor and it stays first. */}
      {church ? (
        <SermonCard
          service={church}
          homeSpaceId={homeSpaceId}
          onOpenNote={openNote}
          onTakeNotes={takeNotes}
        />
      ) : null}
      {contexts.map(({ source, service }) => (
        <SermonCard
          key={source.spaceId}
          service={service}
          contextTitle={source.title}
          homeSpaceId={homeSpaceId}
          onOpenNote={openNote}
          onTakeNotes={takeNotes}
        />
      ))}
    </>
  );
}
