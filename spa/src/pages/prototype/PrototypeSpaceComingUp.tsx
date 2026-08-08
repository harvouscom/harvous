/**
 * "Coming up" inside a church space — the room's next gathering, and one tap
 * into notes on it.
 *
 * Shows **one** gathering: the next one, or the one just past inside the same
 * four-day wall the church card uses, so Thursday still shows Wednesday while
 * someone writes up what they heard. Never a list — the congregant doctrine is
 * *one next gathering per context you joined, never a schedule of any context*
 * (docs/future/CHURCH_SPACE_PLANS_AND_SERVICE_TIMES.md §1), and this is the
 * per-space half of it.
 *
 * It used to be read-only, and staff-only with it: the only read available was
 * the staff plan endpoint, so a member of the room saw nothing. Now it asks a
 * membership-gated endpoint, which means the people who actually gather here
 * can see what the room is on — and write about it, the same one tap the This
 * Sunday card gives the church's own service.
 *
 * Planning still happens in the My Church hub. This is the room telling you
 * what it is studying and handing you a page, not a door into editing the plan.
 *
 * Renders nothing at all when the space has no plan — which is the common case,
 * and must stay silent rather than occupy a room that never gathers.
 */
import { useCallback } from 'react';
import { useNavigate } from '@tanstack/react-router';
import Icon from '@/components/react/Icon';
import { prototypeNoteRouteTo } from '@/lib/prototype-path';
import { getEffectiveDefaultTranslation } from '@/utils/profile-cache';
import { useSpaceComingUp } from '../../hooks/queries/useSpaceComingUp';
import {
  alertCreateNoteFailure,
  useCreateSimpleNote,
} from '../../hooks/mutations/useCreateSimpleNote';
import { getNoteIdFromCreateResponse } from '../../hooks/queries/useNote';
import {
  buildStarterContent,
  currentSermonFor,
  formatServiceTime,
  sermonEyebrow,
  starterFolderForSermon,
  starterNoteTitle,
  weekdayLabel,
  type ChurchSermon,
} from '../../lib/church-services';
import { markPendingNoteFocus } from '../../lib/pending-note-focus';
import { useProtoShell } from '../../layouts/proto-shell-context';
import { noteParamSlug } from './proto-route-slugs';

export interface PrototypeSpaceComingUpProps {
  spaceId: string | null;
  /**
   * Kept for callers that already know there is nothing to ask about. The read
   * itself is membership-gated now, so a member no longer needs staff status to
   * be allowed to look — this is an optimisation, not a permission.
   */
  enabled?: boolean;
}

function isOfflineQueuedCreate(res: unknown): boolean {
  return Boolean(
    res && typeof res === 'object' && 'offlineQueued' in res &&
      (res as { offlineQueued: boolean }).offlineQueued,
  );
}

export default function PrototypeSpaceComingUp({ spaceId, enabled }: PrototypeSpaceComingUpProps) {
  const navigate = useNavigate();
  const { isMobileSidebar, closeDrawer } = useProtoShell();
  const createNote = useCreateSimpleNote();
  const { data } = useSpaceComingUp(spaceId, { enabled });

  const openNote = useCallback(
    (noteId: string) => {
      navigate({ to: prototypeNoteRouteTo(), params: { noteId: noteParamSlug(noteId) } });
      if (isMobileSidebar) closeDrawer({ preserveHistory: true });
    },
    [closeDrawer, isMobileSidebar, navigate],
  );

  const takeNotes = useCallback(
    (gathering: ChurchSermon) => {
      // Already wrote something for this gathering — open it rather than making
      // a second one. The server resolved this from the viewer's own note row.
      if (gathering.viewerNoteId) {
        openNote(gathering.viewerNoteId);
        return;
      }
      if (!spaceId || createNote.isPending) return;

      /*
        Written into the room, not into My Home — unlike the church's Sunday
        sermon, this gathering belongs to a space the viewer is a member of, so
        the note about it belongs beside the room's other notes.
      */
      const folder = starterFolderForSermon(gathering);

      createNote.mutate(
        {
          spaceId,
          title: starterNoteTitle(gathering),
          content: buildStarterContent(gathering, getEffectiveDefaultTranslation()),
          noteType: 'default',
          startedFromServiceId: gathering.id,
          startedFromServiceTitle: gathering.title,
          ...(folder
            ? {
                primaryCollection: folder,
                // Whoever planned the series named this grouping — chosen, not
                // guessed, which is also what stops the auto-folder pass
                // overwriting it.
                collectionUserOverride: true,
              }
            : {}),
          ...(gathering.starter
            ? {
                startedFromTemplateId: gathering.starter.templateId,
                startedFromTemplateName: gathering.starter.templateName,
              }
            : {}),
        },
        {
          onSuccess: (res) => {
            // Offline: the optimistic row is already in the list and the create
            // is queued. Don't navigate to an id the router can't resolve.
            if (isOfflineQueuedCreate(res)) return;
            const nid = getNoteIdFromCreateResponse(res);
            if (nid) {
              markPendingNoteFocus(nid);
              openNote(nid);
            }
          },
          onError: (err) => alertCreateNoteFailure(err),
        },
      );
    },
    [createNote, openNote, spaceId],
  );

  /*
    Undated rows are dropped first: the staff plan carries a backlog of ideas,
    and "coming up" must never be answered with something nobody has committed
    to a day. Channels never reach here — the server returns no services for
    them, because a channel's entries are unpublished staff intentions rather
    than a time anyone turns up for.
  */
  const gathering = data?.services
    ? currentSermonFor(
        data.services.filter(
          (service): service is typeof service & { serviceDate: string } =>
            service.serviceDate !== null,
        ),
      )
    : null;
  if (!gathering) return null;

  /*
    The space's own rhythm, not the church's clock list: a space gathers once,
    so its `meetingTime` labels every row rather than each row carrying a time.
  */
  const rhythm =
    data?.space?.meetingTime && data.space.meetingDay !== null
      ? `${weekdayLabel(data.space.meetingDay)}s · ${formatServiceTime(data.space.meetingTime)}`
      : null;
  const hasNote = Boolean(gathering.viewerNoteId);

  return (
    <div className="proto-home-section">
      <p className="proto-caption proto-home-section__eyebrow">
        {sermonEyebrow(gathering)}
        {rhythm ? ` · ${rhythm}` : ''}
      </p>
      <div className="proto-glass-surface proto-glass-surface--panel proto-church-tools">
        <button
          type="button"
          className="proto-church-tools__row"
          aria-label={
            hasNote ? 'Open my note on this gathering' : 'New note on this gathering'
          }
          disabled={createNote.isPending}
          onClick={() => takeNotes(gathering)}
        >
          <span className="proto-church-tools__row-icon" aria-hidden>
            <Icon name="calendar-check" size={13} />
          </span>
          <span className="proto-church-tools__row-text">
            <span
              className="pds-list-title proto-church-tools__row-title proto-marquee"
              title={gathering.title}
            >
              <span>{gathering.title}</span>
            </span>
            <span className="proto-caption proto-church-tools__row-meta proto-marquee-self">
              {gathering.reference || 'No passage yet'}
              {gathering.seriesTitle ? ` · ${gathering.seriesTitle}` : ''}
            </span>
          </span>
          <span className="proto-church-tools__row-chevron" aria-hidden>
            <Icon name={hasNote ? 'caret-right' : 'pen-to-square'} size={11} />
          </span>
        </button>
      </div>
    </div>
  );
}
