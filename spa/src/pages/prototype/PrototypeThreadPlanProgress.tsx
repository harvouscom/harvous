/**
 * Where the viewer stands in a study plan, and the one control that changes it.
 *
 * One component because two surfaces show a plan's steps and they are not the
 * same object: the space hub's drilldown shows a room's Thread, and the Library
 * panel shows any `thread_*` — which is the *only* place a personal reading
 * plan is ever drawn. A second copy of this row is how the two would end up
 * disagreeing about what "finished" means.
 *
 * Three rules it carries, all decided before it existed:
 *
 * - **Everyone sees it, an owner included.** Closing the run and finishing it
 *   yourself are two facts about two different subjects — a leader who walked
 *   the plan finished it as surely as anyone else — so this never gates on who
 *   may manage the Thread.
 * - **Never gated on the run being closed.** Closed is a label, not a lock;
 *   people finish late, and the route has no closed check either.
 * - **Claimed, never derived.** "Opened" is not "read" and not "finished", so
 *   the count and the claim are two separate statements on one line rather than
 *   one inferred from the other.
 *
 * Renders nothing for a collection, or for a sequence nobody has written steps
 * for: a plan with no steps has no finish to claim.
 */
import { useState } from 'react';
import { useCompleteThreadPlan } from '../../hooks/mutations/useCompleteThreadPlan';
import { viewerProgressLabel } from '../../hooks/queries/useThreadNotes';
import { protoRelativeCaption } from './proto-time';

export default function PrototypeThreadPlanProgress({
  threadId,
  isSequence,
  total,
  viewerOpenedNoteIds,
  viewerCompletedAt,
}: {
  threadId: string;
  isSequence: boolean;
  /** The whole plan's step count, not the loaded page's. */
  total: number;
  viewerOpenedNoteIds: string[];
  viewerCompletedAt: string | null;
}) {
  const completePlan = useCompleteThreadPlan();
  const [error, setError] = useState<string | null>(null);

  if (!isSequence || total <= 0) return null;

  const progressLabel = viewerProgressLabel(viewerOpenedNoteIds, total);

  return (
    <>
      <div className="proto-shared-thread-drilldown__progress">
        <p className="proto-caption proto-shared-thread-drilldown__progress-line">
          {viewerCompletedAt
            ? `Finished · ${protoRelativeCaption(viewerCompletedAt)}`
            : /* "0 of 8" on a plan you have not begun is noise on the surface
                 trying to get you to begin it. */
              (progressLabel ?? 'Not started')}
        </p>
        <button
          type="button"
          className="proto-shared-thread-action"
          disabled={completePlan.isPending}
          onClick={() => {
            setError(null);
            completePlan.mutate(
              { threadId, completed: !viewerCompletedAt },
              {
                onError: (err: any) =>
                  setError(err?.message || 'Could not update your progress.'),
              },
            );
          }}
        >
          {viewerCompletedAt ? 'Mark unfinished' : 'I finished this'}
        </button>
      </div>
      {error ? (
        <p className="proto-connect-note-sheet__error" role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}
