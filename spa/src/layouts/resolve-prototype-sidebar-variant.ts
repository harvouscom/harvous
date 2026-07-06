import type { SidebarLayer } from './proto-shell-context';
import { readSharedSpaceDashboardFixtureMode } from '../pages/dev/shared-spaces-design/shared-space-dashboard-fixture-mode';

export type PrototypeSidebarVariant = 'admin' | 'shared-space' | 'shared-list' | 'personal';

export function resolvePrototypeSidebarVariant(input: {
  isAdminRoute: boolean;
  isSharedSpace: boolean;
  sidebarLayer: SidebarLayer;
  activeSpaceId: string | null;
}): PrototypeSidebarVariant {
  if (input.isAdminRoute) return 'admin';
  if (
    import.meta.env.DEV &&
    readSharedSpaceDashboardFixtureMode() &&
    input.sidebarLayer === 'space'
  ) {
    return 'shared-space';
  }
  if (input.isSharedSpace && input.sidebarLayer === 'space') return 'shared-space';
  if (input.isSharedSpace && input.activeSpaceId) return 'shared-list';
  return 'personal';
}
