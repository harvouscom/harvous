/** Cancel a pending RAF and flush the latest editor HTML to the parent synchronously. */
export function flushCoalescedNoteHtmlOnUnmount(opts: {
  pendingRafId: number | null;
  latestHtml: string;
  onContentChange?: (html: string, meta?: { programmatic?: boolean }) => void;
  cancelAnimationFrame: (id: number) => void;
  wasUserEdit?: boolean;
}): void {
  if (opts.pendingRafId != null) {
    opts.cancelAnimationFrame(opts.pendingRafId);
  }
  if (opts.latestHtml && opts.onContentChange) {
    opts.onContentChange(opts.latestHtml, opts.wasUserEdit ? undefined : { programmatic: true });
  }
}

/** Mirror handleContentChange ref sync — parent save must not wait for re-render. */
export function mirrorEditContentRef(
  editContentRef: { current: string },
  canonical: string,
): void {
  editContentRef.current = canonical;
}
