import type { ProtoLocation } from './proto-location';

/**
 * Which surface the main pane shows for a location.
 *
 * `ProtoLocation` has said since it was written that `spaceId: null` means "the parent's own
 * hub (My Home dashboard / My Church hub)". My Home's hub is Activity and has been on the
 * canvas since the sidebar started retiring. My Church's had nowhere to be: `PrototypeHomePage`
 * rendered the personal feed whatever the parent, so a church's entire surface was the rail,
 * and deleting the rail would have taken channels, Planner, Team, templates and settings with
 * it. This is the branch that was missing rather than a new idea.
 *
 * Deliberately a `switch` over `SpaceParent['kind']` with an exhaustiveness check, matching
 * `resolvePrototypeSidebarVariant` — a new parent kind should fail to compile here rather than
 * quietly fall through to Activity, which is the one outcome that looks like it works.
 *
 * A space (`spaceId` set) still resolves to Activity. That is today's behaviour kept
 * deliberately: the space hub is the next phase, and this phase changes exactly one thing.
 */
export type MainPaneSurface = 'activity' | 'church-hub';

export function resolveMainPaneSurface(location: ProtoLocation): MainPaneSurface {
  /* A space open means a space is what you are looking at, whoever its parent is. Phase 2
     gives that its own hub; until then it is the feed, unchanged. */
  if (location.spaceId) return 'activity';

  switch (location.parent.kind) {
    case 'home':
      return 'activity';
    case 'church':
      return 'church-hub';
    default: {
      // Exhaustiveness: a new SpaceParent kind fails to compile until handled.
      const exhaustive: never = location.parent;
      void exhaustive;
      return 'activity';
    }
  }
}
