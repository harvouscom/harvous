import type { ProtoLocation } from './proto-location';

export type PrototypeSidebarVariant = 'admin' | 'shared-list' | 'personal';

/**
 * Which sidebar to render.
 *
 * Three answers now, where there were five. The church hub and the shared-space dashboard were
 * two of them, and both have moved to the canvas — `resolveMainPaneSurface` sends a church or a
 * shared space to its own sheet, so rendering either in the rail as well would be the same
 * surface twice on one screen, once at full width and once at 288px.
 *
 * What is left is a clean split rather than a shrunken version of the old one. The canvas
 * answers *where am I* — the church and its rooms, the space and its tools. The rail answers
 * *what do I have* — the notes, scoped to a space when one is open. Nothing appears in both.
 *
 * `sidebarLayer` is gone from the inputs, and its absence is the evidence. The layer existed to
 * choose between a space dashboard and a list *inside the rail*; with the dashboards elsewhere
 * there is only ever a list, so consulting the layer here would be reading a question nothing
 * asks any more. It still drives the switcher's two-click behaviour, which is its own thing.
 */
export function resolvePrototypeSidebarVariant(input: {
  isAdminRoute: boolean;
  isSharedSpace: boolean;
  location: ProtoLocation;
}): PrototypeSidebarVariant {
  if (input.isAdminRoute) return 'admin';
  /* A space open means its notes, whoever its parent is. With no space open there is nothing
     to scope to, so a church hub and My Home both leave the rail on the personal list. */
  if (input.isSharedSpace && input.location.spaceId) return 'shared-list';
  return 'personal';
}
