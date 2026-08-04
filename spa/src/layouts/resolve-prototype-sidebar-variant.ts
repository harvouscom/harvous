import type { SidebarLayer } from './proto-shell-context';
import type { ProtoLocation } from './proto-location';
import { readSharedSpaceDashboardFixtureMode } from '../pages/dev/shared-spaces-design/shared-space-dashboard-fixture-mode';

export type PrototypeSidebarVariant =
  | 'admin'
  | 'church-hub'
  | 'shared-space'
  | 'shared-list'
  | 'personal';

/**
 * Which sidebar to render.
 *
 * When a space is open, the space views win. When none is, the **parent** picks
 * the hub — a `switch` over `SpaceParent['kind']` rather than a chain of
 * `&&`-ed null checks, so adding a parent kind is a new case the compiler
 * demands (see the exhaustiveness check below) instead of a branch that's easy
 * to forget.
 */
function hubVariantForParent(parent: ProtoLocation['parent']): PrototypeSidebarVariant {
  switch (parent.kind) {
    case 'home':
      return 'personal';
    case 'church':
      return 'church-hub';
    default: {
      // Exhaustiveness: a new SpaceParent kind fails to compile until handled.
      const exhaustive: never = parent;
      void exhaustive;
      return 'personal';
    }
  }
}

export function resolvePrototypeSidebarVariant(input: {
  isAdminRoute: boolean;
  isSharedSpace: boolean;
  sidebarLayer: SidebarLayer;
  location: ProtoLocation;
}): PrototypeSidebarVariant {
  if (input.isAdminRoute) return 'admin';
  if (
    import.meta.env.DEV &&
    readSharedSpaceDashboardFixtureMode() &&
    input.sidebarLayer === 'space'
  ) {
    return 'shared-space';
  }

  const { location } = input;
  if (input.isSharedSpace && input.sidebarLayer === 'space') return 'shared-space';
  if (input.isSharedSpace && location.spaceId) return 'shared-list';

  // No space open: the parent decides the hub. The list layer keeps the
  // personal list sidebar regardless of parent (that's the layer's job).
  if (!location.spaceId && input.sidebarLayer === 'space') {
    return hubVariantForParent(location.parent);
  }
  return 'personal';
}
