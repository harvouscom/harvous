/** Three-dot loading indicator shared by Home and other sidebar space views. */
import { useEffect, useState } from 'react';
import ProtoLoadingDots from './ProtoLoadingDots';

/*
 * React Query pauses a fetch while the browser is offline, so with nothing cached the dots
 * would run forever with no word about why. While offline they say so; the line goes the
 * moment the connection is back and the paused fetch resumes.
 */
function useIsOffline(): boolean {
  const [offline, setOffline] = useState(() => typeof navigator !== 'undefined' && navigator.onLine === false);
  useEffect(() => {
    const update = () => setOffline(navigator.onLine === false);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return offline;
}

export default function ProtoSpaceLoading({
  label = 'Loading',
  /**
   * Fade out in place while the content that replaces it paints underneath.
   *
   * Positioning is part of leaving, not decoration: a block still in flow would keep
   * reserving its own height and push the dashboard down for the length of the fade, so
   * the pane would settle twice — once for the content and once for the dots finally
   * going. See `useProtoSpaceLoaderState`, which owns the timing.
   */
  leaving = false,
  /**
   * Hold the dots invisible for a beat, so a fast load never flashes them. On by default
   * because most callers render this on the first frame `isPending` is true, with nothing
   * holding it back. Pass `false` where the caller already waits — `useProtoSpaceLoaderState`
   * or `useSettledFlag` — or the two delays stack.
   *
   * CSS rather than a timer: the block is in flow from the first frame, so nothing moves
   * when the dots do appear, and a component that unmounts inside the window costs nothing.
   */
  grace = true,
}: {
  label?: string;
  leaving?: boolean;
  grace?: boolean;
}) {
  const offline = useIsOffline();
  const modifier = leaving ? ' proto-home-loading--leaving' : grace ? ' proto-home-loading--grace' : '';
  return (
    <div className={`proto-home-loading${modifier}`}>
      <ProtoLoadingDots label={label} />
      {offline && !leaving ? (
        <p className="proto-home-loading__offline" role="status">
          You’re offline. This will load when you’re back online.
        </p>
      ) : null}
    </div>
  );
}
