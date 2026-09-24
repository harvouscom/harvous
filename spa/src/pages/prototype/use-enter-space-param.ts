/**
 * `/?enterSpace=<id>` — honoured on arrival at Home, then dropped.
 *
 * The link a notification carries when it is about one space (see `src/utils/enter-space-link.ts`).
 * The switch goes through `useSwitchToSpace`, the switcher's own path, and the parent is derived
 * from the space's row, so a church channel lands in church context exactly as a click in the
 * menu would. Waits for navigation so the row can be found; a space the reader can no longer see
 * (left, deleted) simply leaves them on Home rather than in a location that does not exist.
 *
 * The parameter goes by `replace`, so Back does not return to a URL that would switch them again.
 */
import { useEffect, useRef } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { ENTER_SPACE_PARAM } from '@/utils/enter-space-link';
import { useNavigation } from '../../hooks/queries/useNavigation';
import { useSwitchToSpace } from '../../hooks/useSwitchToSpace';
import { parentForSpace } from '../../layouts/proto-location';
import { normalizeSwitcherSpaceId } from './space-switcher-unseen';

export function useEnterSpaceParam(): void {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const raw = search[ENTER_SPACE_PARAM];
  const target = typeof raw === 'string' || typeof raw === 'number' ? String(raw).trim() : '';
  const { data: nav, isFetched } = useNavigation({ enabled: Boolean(target) });
  const switchToSpace = useSwitchToSpace();
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (!target || handled.current === target) return;
    if (!nav && !isFetched) return;
    handled.current = target;

    const id = normalizeSwitcherSpaceId(target);
    const row = [...(nav?.spaces ?? []), ...(nav?.memberOfSpaces ?? [])].find(
      (space) => normalizeSwitcherSpaceId(space.id) === id,
    );
    if (row) switchToSpace(id, parentForSpace(row));

    void navigate({
      to: '.',
      search: (prev: Record<string, unknown>) => {
        const { [ENTER_SPACE_PARAM]: _dropped, ...rest } = prev ?? {};
        return rest;
      },
      replace: true,
    } as any);
  }, [target, nav, isFetched, switchToSpace, navigate]);
}
