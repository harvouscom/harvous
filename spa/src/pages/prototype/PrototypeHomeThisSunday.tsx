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
import { prototypeNoteRouteTo } from '@/lib/prototype-path';
import Icon from '@/components/react/Icon';
import { getEffectiveDefaultTranslation } from '@/utils/profile-cache';
import {
  alertCreateNoteFailure,
  useCreateSimpleNote,
} from '../../hooks/mutations/useCreateSimpleNote';
import { getNoteIdFromCreateResponse } from '../../hooks/queries/useNote';
import { useChurchServices } from '../../hooks/queries/useChurchServices';
import {
  buildStarterContent,
  currentServiceFor,
  serviceEyebrow,
  starterNoteTitle,
  type ChurchService,
} from '../../lib/church-services';
import { useProtoShell } from '../../layouts/proto-shell-context';
import { noteParamSlug } from './proto-route-slugs';
import ProtoSpaceMenuIcon from './ProtoSpaceMenuIcon';

type Props = {
  homeSpaceId: string | null;
};

function isOfflineQueuedCreate(res: unknown): boolean {
  return Boolean(
    res && typeof res === 'object' && 'offlineQueued' in res &&
      (res as { offlineQueued: boolean }).offlineQueued,
  );
}

export default function PrototypeHomeThisSunday({ homeSpaceId }: Props) {
  const navigate = useNavigate();
  const createNote = useCreateSimpleNote();
  const { isMobileSidebar, closeDrawer } = useProtoShell();
  const { data } = useChurchServices();

  const service = useMemo(
    () => (data?.connected ? currentServiceFor(data.services) : null),
    [data],
  );

  const openNote = useCallback(
    (noteId: string) => {
      navigate({
        to: prototypeNoteRouteTo(),
        params: { noteId: noteParamSlug(noteId) },
      });
      if (isMobileSidebar) closeDrawer({ preserveHistory: true });
    },
    [closeDrawer, isMobileSidebar, navigate],
  );

  const takeNotes = useCallback(
    (svc: ChurchService) => {
      // Already wrote something for this service — open it rather than making
      // a second one. The server resolved this from the viewer's own note row.
      if (svc.viewerNoteId) {
        openNote(svc.viewerNoteId);
        return;
      }
      if (!homeSpaceId || createNote.isPending) return;

      createNote.mutate(
        {
          spaceId: homeSpaceId,
          title: starterNoteTitle(svc),
          content: buildStarterContent(svc, getEffectiveDefaultTranslation()),
          noteType: 'default',
          startedFromServiceId: svc.id,
          startedFromServiceTitle: svc.title,
          ...(svc.starter
            ? {
                startedFromTemplateId: svc.starter.templateId,
                startedFromTemplateName: svc.starter.templateName,
              }
            : {}),
        },
        {
          onSuccess: (res) => {
            // Offline: the optimistic row is already in the list and the create
            // is queued. Don't navigate to an id the router can't resolve.
            if (isOfflineQueuedCreate(res)) return;
            const nid = getNoteIdFromCreateResponse(res);
            if (nid) openNote(nid);
          },
          onError: (err) => alertCreateNoteFailure(err),
        },
      );
    },
    [createNote, homeSpaceId, openNote],
  );

  if (!data?.connected || !service) return null;

  const eyebrow = serviceEyebrow(service);
  const hasNote = Boolean(service.viewerNoteId);

  return (
    <div className="proto-home-section">
      <p className="proto-caption proto-home-section__eyebrow">{eyebrow}</p>
      {/*
        A div, not a tappable card: the action below is a real <button>, and
        nesting one inside another is invalid and unreachable by keyboard.
      */}
      <div className="proto-glass-surface proto-glass-surface--panel proto-home-card proto-this-sunday">
        <div className="proto-home-card__body">
          <div className="proto-home-card__title-row">
            <span className="proto-home-card__icon-orb" aria-hidden>
              <ProtoSpaceMenuIcon color="paper" size={28} radius={8} iconName="church" />
            </span>
            <div className="proto-church-hub__row-text">
              <p className="pds-list-title proto-home-card__title">{service.title}</p>
              {service.seriesTitle ? (
                <p className="proto-caption proto-church-hub__row-meta">{service.seriesTitle}</p>
              ) : null}
            </div>
            {/*
              Sits in the row's empty right-hand space, so a real labelled
              button costs no extra height.
            */}
            <button
              type="button"
              className="proto-glass-surface proto-glass-surface--control proto-glass-action"
              /* Carries the name when the label span is hidden on narrow sidebars. */
              aria-label={hasNote ? 'Open my note on this service' : 'New note on this service'}
              disabled={createNote.isPending || (!homeSpaceId && !hasNote)}
              onClick={() => takeNotes(service)}
            >
              <Icon name={hasNote ? 'arrow-right' : 'plus'} size={12} aria-hidden />
              <span className="proto-glass-action__label">
                {hasNote ? 'Open note' : 'New note'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
