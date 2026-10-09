/**
 * Who may *start* a family while Family Accounts is in preview.
 *
 * Only starting is gated. Anyone holding an invite can join (a teenager invited by a preview
 * parent is not on any list), and anyone already in a family keeps every family surface.
 *
 * Flip `FAMILY_IN_PREVIEW` to false at launch. Until then the list comes from
 * `FAMILY_PREVIEW_USER_IDS` (comma-separated), mirroring `CONNECTOR_PREVIEW_USER_IDS`, and
 * any non-production server is open so it can be walked locally.
 */

export const FAMILY_IN_PREVIEW = true;

export function familyPreviewUserIds(env: NodeJS.ProcessEnv = process.env): Set<string> {
  return new Set(
    (env.FAMILY_PREVIEW_USER_IDS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

export function canStartFamilyInPreview(userId: string, env: NodeJS.ProcessEnv = process.env): boolean {
  if (!FAMILY_IN_PREVIEW) return true;
  if (env.NODE_ENV !== 'production') return true;
  return familyPreviewUserIds(env).has(userId);
}
