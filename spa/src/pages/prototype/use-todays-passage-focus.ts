/**
 * `/?focus=todays-passage` — the reminder's destination, honoured on arrival.
 *
 * The notification's URL has carried this since the reminder was taught to open Activity, and
 * nothing on this end ever read it. The only consumer was `notification-navigation`, which sets
 * the force-show flag as it routes — so the mark was honoured on exactly one path (a warm tab
 * reached through the service worker, inside the two-minute window the parked destination is
 * kept) and ignored on every other: a cold launch through `openWindow`, a reload of the page the
 * tap landed on, or a link opened by hand. The commit that added the parameter also claimed to
 * scroll to the row, and no scroll was ever written.
 *
 * Reading it here makes the URL itself the instruction, which is what a URL is for.
 *
 * Three things have to happen, in this order, and none of them is the same as the others:
 *
 * 1. **Show it.** The row may have been dismissed earlier today, and a reader who has just
 *    tapped a notification about the passage has plainly changed their mind.
 * 2. **Put the surface where the row lives.** The Today band is only mounted on today's sheet
 *    with no space scope, so a reader who had paged back to Thursday, or narrowed to a shared
 *    space, would land on a page whose Suggested section does not exist. Nothing else resets
 *    those, so the tap has to.
 * 3. **Take them to it.** Suggested sits below Continue, Review and Following; on a phone the
 *    row is comfortably off-screen at the top of Activity, which is its own way of not seeing
 *    today's passage.
 *
 * Then the parameter goes, by `replace`, so Back does not return to a URL that would scroll them
 * down the page a second time.
 */
import { useEffect, useRef } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import {
  forceShowTodaysPassageToday,
  scrollToTodaysPassage,
  TODAYS_PASSAGE_FOCUS,
} from '../../lib/votd-today';

export function useTodaysPassageFocus(input: {
  /** True once Activity has painted its content, rather than its loader. */
  ready: boolean;
  /** Bring the stack back to today — the band is not mounted on any other sheet. */
  showToday: () => void;
}): void {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { focus?: string };
  const focused = search.focus === TODAYS_PASSAGE_FOCUS;
  const handled = useRef(false);
  const { ready, showToday } = input;

  /*
   * Split in two on purpose. The flag and the surface reset have to happen the moment the
   * parameter is seen — the row decides whether to render long before the feed is ready, and
   * setting the flag after that decision is the race this whole file exists to close. The
   * scroll, by contrast, cannot happen until there is something laid out to scroll to.
   */
  useEffect(() => {
    if (!focused || handled.current) return;
    handled.current = true;
    forceShowTodaysPassageToday();
    showToday();
  }, [focused, showToday]);

  useEffect(() => {
    if (!focused || !ready) return;
    /* After paint: the row is rendered in the same commit that flips `ready`, so measuring in
       this effect would measure the loader it replaced. */
    const frame = requestAnimationFrame(() => {
      scrollToTodaysPassage();
      void navigate({ to: '.', search: (prev: Record<string, unknown>) => {
        const { focus: _focus, ...rest } = prev ?? {};
        return rest;
      }, replace: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [focused, navigate, ready]);
}
