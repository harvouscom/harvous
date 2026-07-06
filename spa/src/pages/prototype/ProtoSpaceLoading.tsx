/** Three-dot loading indicator shared by Home and other sidebar space views. */
export default function ProtoSpaceLoading({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="proto-home-loading">
      <span className="load-more-indicator" aria-label={label}>
        <span className="load-more-indicator__dot" />
        <span className="load-more-indicator__dot" />
        <span className="load-more-indicator__dot" />
      </span>
    </div>
  );
}
