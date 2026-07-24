/** Three-dot loading indicator shared by Home and other sidebar space views. */
export default function ProtoSpaceLoading({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="proto-home-loading" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      <span className="load-more-indicator" aria-hidden>
        <span className="load-more-indicator__dot" />
        <span className="load-more-indicator__dot" />
        <span className="load-more-indicator__dot" />
      </span>
    </div>
  );
}
