/**
 * Moving a sermon in time — the write behind every drag on the board and the
 * calendar.
 *
 * Optimistic, because a drag that snaps back for 300ms while the server answers
 * feels broken even when it succeeds. The rollback path matters more than usual
 * here: the server can legitimately refuse a drop (that Sunday is already
 * taken), and the card has to return to where it came from with the server's
 * own words about why.
 */
import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/clerk-react';
import { APIError } from '../../../lib/api';
import {
  churchTeachingPlanQueryKey,
  type TeachingPlanResponse,
  type TeachingPlanSermon,
} from '../../../hooks/queries/useChurchTeachingPlan';
import {
  churchSpacePlanQueryKey,
  type ChurchSpacePlanResponse,
} from '../../../hooks/queries/useChurchSpacePlan';
import { resolveDropDate, type PlannerWeek } from '../../../lib/planner-board';

type PlanPayload = TeachingPlanResponse | ChurchSpacePlanResponse;

/** The one mutation shape both plans share, narrowed to what this needs. */
type PlanActions = {
  mutate: (
    action: { kind: 'update'; serviceId: string; serviceDate: string | null },
    options?: { onError?: (error: unknown) => void },
  ) => void;
};

export function usePlannerSchedule({
  planSpaceId,
  orgId,
  services,
  actions,
  defaultDay,
}: {
  planSpaceId: string | null;
  orgId: string | null;
  services: TeachingPlanSermon[];
  actions: PlanActions;
  defaultDay: number | null;
}) {
  const queryClient = useQueryClient();
  const { userId } = useAuth();
  const [error, setError] = useState<string | null>(null);

  const queryKey =
    planSpaceId !== null
      ? churchSpacePlanQueryKey(userId, planSpaceId)
      : churchTeachingPlanQueryKey(userId, orgId);

  const moveToDate = useCallback(
    (serviceId: string, nextDate: string | null) => {
      const service = services.find((s) => s.id === serviceId);
      if (!service || service.serviceDate === nextDate) return;
      setError(null);

      /*
        Cancel first: an in-flight refetch that lands after this patch would
        overwrite it with the pre-drag plan, and the card would jump back for no
        reason the user can see.
      */
      void queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<PlanPayload>(queryKey);

      queryClient.setQueryData<PlanPayload>(queryKey, (current) => {
        if (!current) return current;
        return {
          ...current,
          services: current.services.map((row) =>
            row.id === serviceId
              ? {
                  ...row,
                  serviceDate: nextDate,
                  /* Unscheduling releases both kinds of time — the server does
                     the same, and a card still showing "9:00" in the Ideas
                     column would be a lie until the refetch landed. */
                  ...(nextDate === null ? { serviceTimeIds: [], serviceTime: null } : null),
                }
              : row,
          ),
        };
      });

      actions.mutate(
        { kind: 'update', serviceId, serviceDate: nextDate },
        {
          onError: (err) => {
            if (previous) queryClient.setQueryData(queryKey, previous);
            /* The server's refusal names the collision ("That date already has
               a sermon…") — worth more verbatim than any wording here. */
            setError(
              err instanceof APIError
                ? err.message
                : err instanceof Error
                  ? err.message
                  : 'Could not move this sermon.',
            );
          },
        },
      );
    },
    [actions, queryClient, queryKey, services],
  );

  /** Board drop: a week column, not a specific day. */
  const move = useCallback(
    (serviceId: string, week: PlannerWeek | null) => {
      const service = services.find((s) => s.id === serviceId);
      if (!service) return;
      moveToDate(serviceId, week ? resolveDropDate(service, week, defaultDay) : null);
    },
    [defaultDay, moveToDate, services],
  );

  return { move, moveToDate, error, clearError: () => setError(null) };
}
