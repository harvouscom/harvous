/**
 * "Is there anything new?" — for the toolbar, which is now where that question is asked.
 *
 * The switcher's own trigger carries this dot, but in the toolbar the trigger *is* the
 * Activity segment and the switcher renders no button of its own, so the dot had nowhere to
 * live: it appeared on the sidebar's copy only, which is the surface being retired. Same rule
 * as the menu rows, plumbed from where the toolbar happens to keep the active space.
 */
import { useEffect, useMemo, useState } from 'react';
import { localDayIndex } from '@/utils/local-day-index';
import { useNavigation } from '../../hooks/queries/useNavigation';
import { recallShelfHasUnseen, subscribeRecallShelfSeenChanged } from './proto-recall-seen';
import {
  anySpaceHasUnseenActivity,
  normalizeSwitcherSpaceId,
  unseenDotLabelSuffix,
} from './space-switcher-unseen';

export function useSpaceSwitcherUnseen(input: {
  homeSpaceId?: string | null;
  activeSpaceId?: string | null;
}): { suggestions: boolean; spaces: boolean; label: string | null } {
  const { data: nav } = useNavigation();
  const [seenTick, setSeenTick] = useState(0);
  useEffect(() => subscribeRecallShelfSeenChanged(() => setSeenTick((t) => t + 1)), []);

  /* The toolbar is never "at the shelf" the way the sidebar's space layer is — it is chrome
     above whatever you are reading — so the sidebar's away-from-shelf gate has no analogue
     here and the answer is simply whether anything is unseen. */
  const suggestions = useMemo(
    () => recallShelfHasUnseen(input.homeSpaceId ?? null, localDayIndex(new Date())),
    // `seenTick` is the subscription; the day is read fresh each time it fires.
    [input.homeSpaceId, seenTick],
  );

  const spaces = useMemo(
    () =>
      anySpaceHasUnseenActivity(
        [...(nav?.spaces ?? []), ...(nav?.memberOfSpaces ?? [])],
        (row) =>
          Boolean(input.activeSpaceId) &&
          input.activeSpaceId === normalizeSwitcherSpaceId(row.id),
      ),
    [nav?.spaces, nav?.memberOfSpaces, input.activeSpaceId],
  );

  return { suggestions, spaces, label: unseenDotLabelSuffix({ suggestions, spaces }) };
}
