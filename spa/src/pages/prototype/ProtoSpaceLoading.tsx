/** Three-dot loading indicator shared by Home and other sidebar space views. */
import ProtoLoadingDots from './ProtoLoadingDots';

export default function ProtoSpaceLoading({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="proto-home-loading">
      <ProtoLoadingDots label={label} />
    </div>
  );
}
