/**
 * The sermon editor as a docked rail — the expanded planner's answer to the
 * modal.
 *
 * A modal would cover the plan you are editing against, which is exactly the
 * context you want while deciding what goes where. Docking it means the board
 * stays visible, and clicking another card just retargets this pane.
 *
 * The form is `PrototypeSermonEditorFields`, keyed by the selection so that
 * retargeting resets it — the plan query has a 30s staleTime and every mutation
 * invalidates it, so an effect that reset from query data would wipe whatever
 * had been typed on the next refetch.
 */
import { useEffect, useRef } from 'react';
import Icon from '@/components/react/Icon';
import PrototypeSermonEditorFields from '../PrototypeSermonEditorFields';
import PrototypePlannerResourcesField from './PrototypePlannerResourcesField';
import { useChurchSermonActions } from '../../../hooks/queries/useChurchTeachingPlan';
import { useChurchSpaceSermonActions } from '../../../hooks/queries/useChurchSpacePlan';
import type {
  ChurchServiceTimeOption,
  TeachingPlanSeries,
  TeachingPlanSermon,
} from '../../../hooks/queries/useChurchTeachingPlan';

export default function PrototypePlannerEditorPane({
  orgId,
  planSpaceId,
  service,
  createDate,
  series,
  serviceTimes,
  canWrite,
  readOnlyReason,
  canManageChurchTemplates,
  planKind,
  onClose,
  onNavigateAway,
}: {
  orgId: string | null;
  planSpaceId: string | null;
  /** The row being edited, or null when creating. */
  service: TeachingPlanSermon | null;
  /** Creating: the day that was clicked, or null for an undated idea. */
  createDate?: string | null;
  series: TeachingPlanSeries[];
  serviceTimes: ChurchServiceTimeOption[];
  canWrite: boolean;
  readOnlyReason: 'lapsed' | 'role' | null;
  canManageChurchTemplates: boolean;
  /** 'content' hides the gathering-only fields — see PrototypeSermonEditorFields. */
  planKind?: 'gathering' | 'content';
  onClose: () => void;
  onNavigateAway: () => void;
}) {
  const paneRef = useRef<HTMLElement | null>(null);
  /* Both mounted, only the one for this plan used — the same guard the fields
     component makes, for the same reason: a pane opened on a space plan must
     not be able to post into the church's. */
  const churchActions = useChurchSermonActions(orgId);
  const spaceActions = useChurchSpaceSermonActions(planSpaceId);
  const attachActions = planSpaceId ? spaceActions : churchActions;

  /*
    Escape closes the pane, not the whole planner. Marking it handled is what
    tells the panel's document-level listener to stand down — closing the whole
    surface when the user meant "cancel this edit" would lose the plan they were
    looking at as well as the edit. That check works because React attaches its
    handlers at the root container, which the event passes on its way to
    `document`, so `defaultPrevented` is already set by the time it lands there.
    This listener is on the pane itself and therefore runs *before* React's, so
    it cannot rely on the same trick — hence the guard below.
  */
  useEffect(() => {
    const pane = paneRef.current;
    if (!pane) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      /*
        An open listbox owns Escape: dismissing the series suggestions is what
        the key means while they are showing. Its own handler runs later in the
        bubble, so it cannot stop us — we have to stand down for it.
      */
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest('[role="combobox"][aria-expanded="true"]')
      ) {
        return;
      }
      event.preventDefault();
      onClose();
    };
    pane.addEventListener('keydown', onKeyDown);
    return () => pane.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const isEditing = Boolean(service);
  /* A channel publishes entries; calling one a "sermon" in its own editor is
     the same mismatch the plan's buttons had. */
  const noun = planKind === 'content' ? 'entry' : 'sermon';
  const heading = isEditing
    ? `Edit ${noun}`
    : createDate
      ? `New ${noun}`
      : 'New idea';

  return (
    <aside ref={paneRef} className="proto-planner-editor" aria-label={heading}>
      <div className="proto-side-panel__header proto-side-panel__header--minimal">
        <span className="proto-side-panel__header-label">
          <Icon name="calendar-check" size={13} aria-hidden />
          {heading}
        </span>
        <div className="proto-side-panel__header-actions">
          <button
            type="button"
            className="proto-side-panel__action-btn"
            title="Close"
            aria-label="Close editor"
            onClick={onClose}
          >
            <Icon name="xmark" size={12} />
          </button>
        </div>
      </div>

      <div className="proto-planner-editor__body proto-create-folder-sheet">
        {canWrite ? (
          <PrototypeSermonEditorFields
            /* Remount on retarget: the reset that a shared instance would need
               has to fire on selection alone, never on query data. A key is the
               honest way to say that. */
            key={service ? service.id : `create:${createDate ?? 'idea'}`}
            orgId={orgId}
            service={service}
            series={series}
            serviceTimes={serviceTimes}
            planSpaceId={planSpaceId}
            canManageChurchTemplates={canManageChurchTemplates}
            active
            createDefaultDate={isEditing ? undefined : (createDate ?? null)}
            allowNullDate
            planKind={planKind}
            onDone={onClose}
            onNavigateAway={onNavigateAway}
          />
        ) : (
          <p className="proto-caption proto-planner__readonly">
            {readOnlyReason === 'lapsed'
              ? 'This plan is read-only while the church pilot is paused.'
              : 'A pastor or admin changes what is planned here.'}
          </p>
        )}

        {/*
          Only for a saved entry. Attachments are a join on a row that has to
          exist first, and offering the picker mid-create would promise a link
          the Save has not earned yet. Read-only viewers still see the list —
          knowing what a week draws on is the point of showing it.
        */}
        {service ? (
          <div className="proto-service-editor proto-planner-editor__resources">
            <PrototypePlannerResourcesField
              orgId={orgId}
              attached={service.resources ?? []}
              canWrite={canWrite}
              pending={attachActions.isPending}
              onChange={(itemIds) =>
                attachActions.mutate({ kind: 'attachments', serviceId: service.id, itemIds })
              }
            />
          </div>
        ) : null}
      </div>
    </aside>
  );
}
