/** Three-dot loading indicator shared by Home and other sidebar space views. */
import ProtoLoadingDots from './ProtoLoadingDots';

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
  const modifier = leaving ? ' proto-home-loading--leaving' : grace ? ' proto-home-loading--grace' : '';
  return (
    <div className={`proto-home-loading${modifier}`}>
      <ProtoLoadingDots label={label} />
    </div>
  );
}
