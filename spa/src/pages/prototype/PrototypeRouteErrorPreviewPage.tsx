/**
 * Dev-only: preview the route error pane (same UI as defaultErrorComponent).
 * Visit /__dev/route-error on localhost while `npm run dev` is running.
 */
export default function PrototypeRouteErrorPreviewPage() {
  throw new Error(
    '[tiptap error]: The editor view is not available. Cannot access editor.view',
  );
}
