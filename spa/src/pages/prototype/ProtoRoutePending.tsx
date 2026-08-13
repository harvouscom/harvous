import ProtoSpaceLoading from './ProtoSpaceLoading';

/**
 * The router's `defaultPendingComponent` — what fills a pane while a `lazyRouteComponent`'s
 * chunk is still in flight. Before this existed the pane rendered nothing at all, which on a
 * PWA cold cache reads as the tap having been ignored rather than as loading.
 *
 * Deliberately the same three-dot indicator the rest of the shell uses for loading rather than
 * a bespoke skeleton: the pending routes (settings categories, admin pages, dev galleries) have
 * no shared layout to skeleton, and a wrong-shaped skeleton that snaps to real content is a
 * worse flicker than a neutral indicator. Timing lives in `proto-motion.ts`.
 */
export default function ProtoRoutePending() {
  return <ProtoSpaceLoading label="Loading" />;
}
