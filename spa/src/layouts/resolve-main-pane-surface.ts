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
 * A *shared* space gets its own hub for the same reason a church does. A personal space does
 * not: narrowing to it is what My Home already means, so it keeps the feed. That is the same
 * distinction the study feed's scope options draw — "a personal space is not a scope" — and
 * drawing it the same way in both places is deliberate.
 */
export type MainPaneSurface = 'activity' | 'church-hub' | 'space-hub';

export function resolveMainPaneSurface(input: {
  location: ProtoLocation;
  /** Whether the open space is one shared with other people, rather than a personal one. */
  isSharedSpace: boolean;
}): MainPaneSurface {
  const { location } = input;

  /* A space open means a space is what you are looking at, whoever its parent is. */
  if (location.spaceId) return input.isSharedSpace ? 'space-hub' : 'activity';

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
