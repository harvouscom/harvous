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
}: {
  label?: string;
  leaving?: boolean;
}) {
  return (
    <div className={`proto-home-loading${leaving ? ' proto-home-loading--leaving' : ''}`}>
      <ProtoLoadingDots label={label} />
    </div>
  );
}
