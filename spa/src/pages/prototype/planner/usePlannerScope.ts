/**
 * Which plan the planner is showing, and which channel the switcher returns to.
 *
 * Shared by the compact pane and the expanded planner so the two agree — a
 * pastor who opens the board from Youth's plan should land on Youth's board,
 * not be quietly returned to the church's.
 *
 * The stored scope is restored once, after `plannableSpaces` first arrives. Not
 * as lazy initial state: the list is empty on the first render while navigation
 * loads, so a restore then would validate every stored channel away and pin the
 * planner to the church plan for the rest of the session.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PlannableSpace } from '../../../hooks/useChurchPlannerAccess';
import { readPlannerScope, writePlannerScope } from './planner-scope-store';

export function usePlannerScope(orgId: string | null, plannableSpaces: PlannableSpace[]) {
  /** null = the church's own plan; a space id = that ministry's. */
  const [planSpaceId, setPlanSpaceId] = useState<string | null>(null);
  /**
   * The channel the second chip stands for while you are on the church side.
   * Held separately from `planSpaceId` because switching to Church must not
   * forget which channel you came from — that is the whole point of a toggle.
   */
  const [lastChannelId, setLastChannelId] = useState<string | null>(null);
  const restoredRef = useRef(false);

  useEffect(() => {
    if (restoredRef.current || !orgId || plannableSpaces.length === 0) return;
    restoredRef.current = true;
    const stored = readPlannerScope(orgId, plannableSpaces.map((s) => s.id));
    if (!stored) return;
    setPlanSpaceId(stored);
    setLastChannelId(stored);
  }, [orgId, plannableSpaces]);

  /*
    A channel that disappears under you — access removed, space deleted — must
    not leave the planner asking for a plan it cannot load. Fall back to the
    church's, which every viewer of this pane can see.
  */
  useEffect(() => {
    if (planSpaceId === null || plannableSpaces.length === 0) return;
    if (plannableSpaces.some((s) => s.id === planSpaceId)) return;
    setPlanSpaceId(null);
    setLastChannelId(null);
    writePlannerScope(orgId, null);
  }, [orgId, planSpaceId, plannableSpaces]);

  const selectPlanScope = useCallback(
    (next: string | null) => {
      setPlanSpaceId(next);
      if (next) setLastChannelId(next);
      writePlannerScope(orgId, next);
    },
    [orgId],
  );

  return { planSpaceId, lastChannelId, selectPlanScope };
}
